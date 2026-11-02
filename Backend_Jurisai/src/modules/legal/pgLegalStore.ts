import pg from "pg";
import { isActCode } from "./acts.js";
import type { LegalStore } from "./legalStore.js";
import type { ChunkHit, EmbeddedChunk, LegalSource } from "./types.js";

/** Minimal SQL surface so the store runs on node-postgres in production and PGlite in tests. */
export interface SqlClient {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<{ rows: T[] }>;
}
export interface SqlDatabase extends SqlClient {
  transaction<T>(fn: (tx: SqlClient) => Promise<T>): Promise<T>;
  end(): Promise<void>;
}

export function pgPoolDatabase(connectionString: string, onIdleError?: (err: Error) => void): SqlDatabase {
  // Idle connections are closed after 10s so they don't go stale behind NAT, proxies or SSH tunnels.
  const pool = new pg.Pool({ connectionString, max: 10, idleTimeoutMillis: 10_000, keepAlive: true });
  // A pooled connection can drop while idle (Postgres restart, network blip). Without a listener
  // node-postgres re-throws that and crashes the process; the pool already discards the dead
  // connection and opens a new one on the next query.
  pool.on("error", (err) => onIdleError?.(err));
  const wrap = (runner: pg.Pool | pg.PoolClient): SqlClient["query"] =>
    (async (text: string, params?: unknown[]) => runner.query(text, params)) as SqlClient["query"];
  return {
    query: wrap(pool),
    async transaction(fn) {
      const client = await pool.connect();
      let broken: Error | undefined;
      try {
        await client.query("BEGIN");
        const result = await fn({ query: wrap(client) });
        await client.query("COMMIT");
        return result;
      } catch (err) {
        // If the connection itself died, ROLLBACK fails too; report the original error.
        await client.query("ROLLBACK").catch((rollbackErr: Error) => {
          broken = rollbackErr;
        });
        throw err;
      } finally {
        client.release(broken); // a broken connection is destroyed, not returned to the pool
      }
    },
    end: () => pool.end(),
  };
}

const toVectorLiteral = (v: number[]) => `[${v.join(",")}]`;

interface SourceRow {
  source_id: string;
  source_type: "statute" | "case";
  act_code: string | null;
  act_name: string | null;
  section_number: string | null;
  section_title: string | null;
  case_name: string | null;
  court: string | null;
  decision_date: string | null;
  citation_text: string | null;
  text: string;
  source_url: string;
  content_hash: string;
}

export class PgLegalStore implements LegalStore {
  constructor(
    private readonly db: SqlDatabase,
    private readonly dimensions: number,
  ) {}

  /** Idempotent DDL. Safe to run on every boot and before ingestion. */
  async ensureSchema(): Promise<void> {
    const statements = [
      `CREATE EXTENSION IF NOT EXISTS vector`,
      `CREATE TABLE IF NOT EXISTS legal_sources (
        source_id      TEXT PRIMARY KEY,
        source_type    TEXT NOT NULL CHECK (source_type IN ('statute', 'case')),
        act_code       TEXT,
        act_name       TEXT,
        section_number TEXT,
        section_title  TEXT,
        case_name      TEXT,
        court          TEXT,
        decision_date  DATE,
        citation_text  TEXT,
        text           TEXT NOT NULL,
        source_url     TEXT NOT NULL,
        content_hash   TEXT NOT NULL,
        ingested_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
        CHECK (source_type <> 'statute' OR (act_code IS NOT NULL AND section_number IS NOT NULL)),
        CHECK (source_type <> 'case' OR (case_name IS NOT NULL AND citation_text IS NOT NULL))
      )`,
      `CREATE UNIQUE INDEX IF NOT EXISTS legal_sources_act_section
        ON legal_sources (act_code, section_number) WHERE source_type = 'statute'`,
      `CREATE TABLE IF NOT EXISTS source_chunks (
        chunk_id  TEXT PRIMARY KEY,
        source_id TEXT NOT NULL REFERENCES legal_sources(source_id) ON DELETE CASCADE,
        text      TEXT NOT NULL,
        embedding vector(${this.dimensions}) NOT NULL
      )`,
      `CREATE INDEX IF NOT EXISTS source_chunks_source_id ON source_chunks (source_id)`,
      `CREATE INDEX IF NOT EXISTS source_chunks_embedding_hnsw ON source_chunks USING hnsw (embedding vector_cosine_ops)`,
    ];
    for (const sql of statements) await this.db.query(sql);

    const { rows } = await this.db.query<{ dim: number }>(
      `SELECT atttypmod AS dim FROM pg_attribute WHERE attrelid = 'source_chunks'::regclass AND attname = 'embedding'`,
    );
    const existing = rows[0]?.dim;
    if (existing !== undefined && existing !== this.dimensions) {
      throw new Error(
        `source_chunks.embedding is vector(${existing}) but EMBEDDING_DIM=${this.dimensions}; re-create the table or fix config`,
      );
    }
  }

  async upsertSource(source: LegalSource, chunks: EmbeddedChunk[]): Promise<void> {
    const s = source;
    await this.db.transaction(async (tx) => {
      await tx.query(
        `INSERT INTO legal_sources (source_id, source_type, act_code, act_name, section_number, section_title,
           case_name, court, decision_date, citation_text, text, source_url, content_hash)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
         ON CONFLICT (source_id) DO UPDATE SET
           source_type = EXCLUDED.source_type, act_code = EXCLUDED.act_code, act_name = EXCLUDED.act_name,
           section_number = EXCLUDED.section_number, section_title = EXCLUDED.section_title,
           case_name = EXCLUDED.case_name, court = EXCLUDED.court, decision_date = EXCLUDED.decision_date,
           citation_text = EXCLUDED.citation_text, text = EXCLUDED.text, source_url = EXCLUDED.source_url,
           content_hash = EXCLUDED.content_hash, ingested_at = now()`,
        [
          s.sourceId,
          s.sourceType,
          s.sourceType === "statute" ? s.actCode : null,
          s.sourceType === "statute" ? s.actName : null,
          s.sourceType === "statute" ? s.sectionNumber : null,
          s.sourceType === "statute" ? s.sectionTitle : null,
          s.sourceType === "case" ? s.caseName : null,
          s.sourceType === "case" ? s.court : null,
          s.sourceType === "case" ? s.decisionDate : null,
          s.sourceType === "case" ? s.citationText : null,
          s.text,
          s.sourceUrl,
          s.contentHash,
        ],
      );
      await tx.query(`DELETE FROM source_chunks WHERE source_id = $1`, [s.sourceId]);
      for (const chunk of chunks) {
        if (chunk.embedding.length !== this.dimensions) {
          throw new Error(`chunk ${chunk.chunkId} has ${chunk.embedding.length} dims, expected ${this.dimensions}`);
        }
      }
      // All chunks in one statement: a long judgment is one round trip, not dozens.
      await tx.query(
        `INSERT INTO source_chunks (chunk_id, source_id, text, embedding)
         SELECT c, s, t, e::vector FROM unnest($1::text[], $2::text[], $3::text[], $4::text[]) AS u(c, s, t, e)`,
        [
          chunks.map((c) => c.chunkId),
          chunks.map((c) => c.sourceId),
          chunks.map((c) => c.text),
          chunks.map((c) => toVectorLiteral(c.embedding)),
        ],
      );
    });
  }

  async search(queryEmbedding: number[], k: number): Promise<ChunkHit[]> {
    const { rows } = await this.db.query<{ chunk_id: string; source_id: string; text: string; score: number }>(
      `SELECT chunk_id, source_id, text, 1 - (embedding <=> $1::vector) AS score
       FROM source_chunks
       ORDER BY embedding <=> $1::vector
       LIMIT $2`,
      [toVectorLiteral(queryEmbedding), k],
    );
    return rows.map((r) => ({ chunkId: r.chunk_id, sourceId: r.source_id, text: r.text, score: Number(r.score) }));
  }

  async getSources(sourceIds: string[]): Promise<Map<string, LegalSource>> {
    const out = new Map<string, LegalSource>();
    if (sourceIds.length === 0) return out;
    const { rows } = await this.db.query<SourceRow>(
      `SELECT source_id, source_type, act_code, act_name, section_number, section_title, case_name, court,
              decision_date::text AS decision_date, citation_text, text, source_url, content_hash
       FROM legal_sources WHERE source_id = ANY($1::text[])`,
      [sourceIds],
    );
    for (const row of rows) out.set(row.source_id, rowToSource(row));
    return out;
  }

  async countSources(): Promise<number> {
    const { rows } = await this.db.query<{ n: number | string }>(`SELECT count(*) AS n FROM legal_sources`);
    return Number(rows[0]?.n ?? 0);
  }

  close(): Promise<void> {
    return this.db.end();
  }
}

function rowToSource(r: SourceRow): LegalSource {
  const base = { sourceId: r.source_id, text: r.text, sourceUrl: r.source_url, contentHash: r.content_hash };
  if (r.source_type === "statute") {
    if (!r.act_code || !isActCode(r.act_code)) throw new Error(`unknown act_code ${r.act_code} for ${r.source_id}`);
    return {
      ...base,
      sourceType: "statute",
      actCode: r.act_code,
      actName: r.act_name ?? "",
      sectionNumber: r.section_number ?? "",
      sectionTitle: r.section_title ?? "",
    };
  }
  return {
    ...base,
    sourceType: "case",
    caseName: r.case_name ?? "",
    court: r.court ?? "",
    decisionDate: r.decision_date ?? "",
    citationText: r.citation_text ?? "",
  };
}
