import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ingestSeed } from "../src/ingestion/ingestSources.js";
import { HashingEmbedder } from "../src/modules/legal/embeddings.js";
import { PgLegalStore, type SqlDatabase } from "../src/modules/legal/pgLegalStore.js";

/** PGlite is Postgres compiled to WASM, with the real pgvector extension. */
function pgliteDatabase(db: PGlite): SqlDatabase {
  return {
    query: (text, params) => db.query(text, params),
    transaction: (fn) => db.transaction((tx) => fn({ query: (text, params) => tx.query(text, params) })),
    end: () => db.close(),
  };
}

describe("PgLegalStore (pgvector)", () => {
  let db: PGlite;
  let store: PgLegalStore;
  const embedder = new HashingEmbedder(1024);

  beforeEach(async () => {
    db = await PGlite.create({ extensions: { vector } });
    store = new PgLegalStore(pgliteDatabase(db), 1024);
    await store.ensureSchema();
  });
  afterEach(async () => {
    if (!db.closed) await db.close();
  });

  it("ingests the seed and round-trips sources through the lookup table", async () => {
    expect(await ingestSeed({ store, embedder })).toEqual({ upserted: 25, unchanged: 0 });
    expect(await store.countSources()).toBe(25);

    const sources = await store.getSources(["crpc-s438", "case-sc-2014-arnesh-kumar", "does-not-exist"]);
    expect([...sources.keys()].sort()).toEqual(["case-sc-2014-arnesh-kumar", "crpc-s438"]);
    expect(sources.get("crpc-s438")).toMatchObject({ sourceType: "statute", actCode: "CRPC", sectionNumber: "438" });
    // DATE column comes back as the same ISO date, not a timezone-shifted Date object.
    expect(sources.get("case-sc-2014-arnesh-kumar")).toMatchObject({ sourceType: "case", decisionDate: "2014-07-02" });

    const [order] = (await store.getSources(["cpc-o19-r3"])).values();
    expect(order).toMatchObject({ actCode: "CPC", sectionNumber: "Order XIX Rule 3" });
  });

  it("is idempotent: unchanged sources are not re-embedded", async () => {
    await ingestSeed({ store, embedder });
    expect(await ingestSeed({ store, embedder })).toEqual({ upserted: 0, unchanged: 25 });
    const { rows } = await db.query<{ n: number }>("SELECT count(*)::int AS n FROM source_chunks");
    expect(rows[0]!.n).toBe(18 + 7 * 2); // one chunk per provision, two excerpts per case
  });

  it("re-embeds everything when the embedding model changes, even if the text did not", async () => {
    await ingestSeed({ store, embedder });
    const otherModel = Object.assign(new HashingEmbedder(1024), { id: "voyage:voyage-law-2:1024" });
    expect(await ingestSeed({ store, embedder: otherModel })).toEqual({ upserted: 25, unchanged: 0 });
    expect(await ingestSeed({ store, embedder: otherModel })).toEqual({ upserted: 0, unchanged: 25 });
  });

  it("returns nearest chunks by cosine similarity", async () => {
    await ingestSeed({ store, embedder });
    const [q] = await embedder.embed(["registration of FIR information in cognizable cases officer in charge of police station"]);
    const hits = await store.search(q!, 3);
    expect(hits).toHaveLength(3);
    expect(hits[0]!.sourceId).toBe("crpc-s154");
    expect(hits[0]!.score).toBeGreaterThan(hits[2]!.score);
  });

  it("refuses to run against a table built for a different embedding size", async () => {
    await expect(new PgLegalStore(pgliteDatabase(db), 768).ensureSchema()).rejects.toThrow(/vector\(1024\)/);
  });
});
