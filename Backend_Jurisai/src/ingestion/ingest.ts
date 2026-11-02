/**
 * Loads the legal corpus into the configured LegalStore (run before the API is usable).
 *
 *   npm run ingest                 # dev seed file
 *   npm run ingest -- path/to.json # any file in the seed-file shape
 *
 * With LEGAL_STORE=memory there is nothing to persist to: the API seeds itself at boot.
 */
import { loadConfig } from "../config/env.js";
import { createLogger } from "../lib/logger.js";
import { createEmbedder, createLegalStore } from "../modules/legal/factory.js";
import { ingestSeed } from "./ingestSources.js";

const config = loadConfig();
const logger = createLogger(config.LOG_LEVEL, config.NODE_ENV === "development");

if (config.LEGAL_STORE === "memory") {
  logger.error("LEGAL_STORE=memory is seeded at API boot; set LEGAL_STORE=pgvector to ingest into Postgres");
  process.exit(1);
}

const store = await createLegalStore(config, logger);
try {
  const path = process.argv[2];
  const result = await ingestSeed({ store, embedder: createEmbedder(config) }, path);
  logger.info({ ...result, total: await store.countSources() }, "ingestion complete");
} finally {
  await store.close();
}
