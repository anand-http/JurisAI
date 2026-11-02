import type { Logger } from "pino";
import type { Config } from "../../config/env.js";
import { HashingEmbedder, VoyageEmbedder, type Embedder } from "./embeddings.js";
import type { LegalStore } from "./legalStore.js";
import { MemoryLegalStore } from "./memoryLegalStore.js";
import { PgLegalStore, pgPoolDatabase } from "./pgLegalStore.js";

export function createEmbedder(config: Config): Embedder {
  if (config.EMBEDDING_PROVIDER === "voyage") {
    return new VoyageEmbedder(config.VOYAGE_API_KEY!, config.EMBEDDING_MODEL, config.EMBEDDING_DIM);
  }
  return new HashingEmbedder(config.EMBEDDING_DIM);
}

export async function createLegalStore(config: Config, logger?: Logger): Promise<LegalStore> {
  if (config.LEGAL_STORE === "memory") return new MemoryLegalStore();
  const db = pgPoolDatabase(config.DATABASE_URL!, (err) =>
    logger?.warn({ err: err.message }, "postgres connection dropped while idle; reconnecting on next query"),
  );
  const store = new PgLegalStore(db, config.EMBEDDING_DIM);
  await store.ensureSchema();
  return store;
}
