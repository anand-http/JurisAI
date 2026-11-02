import type { ChunkHit, EmbeddedChunk, LegalSource } from "./types.js";

/**
 * The vector index and the citation lookup table behind one interface.
 * Implementations: PgLegalStore (pgvector, production) and MemoryLegalStore (dev/tests).
 * A Chroma implementation would keep chunks in a Chroma collection and sources in any KV/table.
 */
export interface LegalStore {
  /** Idempotent: replaces the source row and all of its chunks. */
  upsertSource(source: LegalSource, chunks: EmbeddedChunk[]): Promise<void>;
  /** Top-k chunks by cosine similarity. */
  search(queryEmbedding: number[], k: number): Promise<ChunkHit[]>;
  /** Lookup-table access used by citation verification and "tap to verify". */
  getSources(sourceIds: string[]): Promise<Map<string, LegalSource>>;
  countSources(): Promise<number>;
  close(): Promise<void>;
}

export async function getSource(store: LegalStore, sourceId: string): Promise<LegalSource | null> {
  return (await store.getSources([sourceId])).get(sourceId) ?? null;
}
