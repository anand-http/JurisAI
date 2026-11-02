import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { Embedder } from "../modules/legal/embeddings.js";
import type { LegalStore } from "../modules/legal/legalStore.js";
import type { LegalSource } from "../modules/legal/types.js";
import { isIndiaCodeSource } from "./sources/indiaCode.js";
import { SeedFile, prepareRecords, type PreparedSource } from "./records.js";

export const DEFAULT_SEED_PATH = new URL("../../data/seed/legal-sources.dev.json", import.meta.url);

export async function loadSeedFile(path: string | URL = DEFAULT_SEED_PATH): Promise<SeedFile> {
  return SeedFile.parse(JSON.parse(await readFile(path, "utf8")));
}

export interface IngestDeps {
  store: LegalStore;
  embedder: Embedder;
  /** Return true to leave an already-stored source untouched (e.g. official text over a dev copy). */
  keepExisting?: (existing: LegalSource) => boolean;
}

/**
 * Embeds and upserts sources. Sources whose content hash is unchanged are skipped, so
 * re-running ingestion only pays for new or edited sections.
 */
export async function ingestSources(
  prepared: PreparedSource[],
  deps: IngestDeps,
): Promise<{ upserted: number; unchanged: number }> {
  const existing = await deps.store.getSources(prepared.map((p) => p.source.sourceId));
  let upserted = 0;
  let unchanged = 0;

  for (const prep of prepared) {
    // The stored hash covers the embedding model too: vectors from different models are
    // not comparable, so switching model (e.g. dev "hash" -> Voyage) must re-embed everything.
    const source = { ...prep.source, contentHash: fingerprint(prep.source.contentHash, deps.embedder.id) };
    const { chunks } = prep;
    const stored = existing.get(source.sourceId);
    if (stored && (stored.contentHash === source.contentHash || deps.keepExisting?.(stored))) {
      unchanged++;
      continue;
    }
    const embeddings = await deps.embedder.embed(
      chunks.map((c) => c.text),
      "document",
    );
    await deps.store.upsertSource(
      source,
      chunks.map((c, i) => ({ ...c, embedding: embeddings[i]! })),
    );
    upserted++;
  }
  return { upserted, unchanged };
}

const fingerprint = (contentHash: string, embedderId: string) =>
  createHash("sha256").update(`${contentHash}|${embedderId}`).digest("hex");

/** The dev seed never overwrites official India Code text loaded by `npm run ingest:statutes`. */
export async function ingestSeed(deps: IngestDeps, path?: string | URL) {
  return ingestSources(prepareRecords(await loadSeedFile(path)), {
    keepExisting: (existing) => isIndiaCodeSource(existing.sourceUrl),
    ...deps,
  });
}
