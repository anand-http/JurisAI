/**
 * Loads complete bare acts from India Code into the legal library, one source per section.
 *
 *   npm run ingest:statutes -- --dry-run          # section counts per act, nothing stored
 *   npm run ingest:statutes                       # all acts listed in INDIA_CODE_ACTS
 *   npm run ingest:statutes -- --acts nia,ica     # selected acts
 *
 * Section ids match the dev seed ("nia-s138"), so official text replaces the seed's copy of
 * the same section; `npm run ingest` never overwrites official text afterwards.
 * Safe to re-run: unchanged sections are skipped.
 */
import { parseArgs } from "node:util";
import { loadConfig } from "../config/env.js";
import { createLogger } from "../lib/logger.js";
import { ACTS, type ActCode } from "../modules/legal/acts.js";
import { createEmbedder, createLegalStore } from "../modules/legal/factory.js";
import { ingestSources } from "./ingestSources.js";
import { StatuteRecord, prepareRecords } from "./records.js";
import { INDIA_CODE_ACTS, fetchActSections, toStatuteRecord } from "./sources/indiaCode.js";

const available = Object.keys(INDIA_CODE_ACTS) as ActCode[];
const { values: args } = parseArgs({
  options: {
    acts: { type: "string", default: available.join(",").toLowerCase() },
    "dry-run": { type: "boolean", default: false },
  },
});

const config = loadConfig();
const logger = createLogger(config.LOG_LEVEL, config.NODE_ENV === "development");
const requested = args.acts.split(",").map((a) => a.trim().toUpperCase()).filter(Boolean);
const invalid = requested.filter((a) => !(available as string[]).includes(a));
if (invalid.length) {
  logger.error(`not available from India Code: ${invalid.join(", ")}. Available: ${available.join(", ").toLowerCase()}`);
  process.exit(1);
}
if (!args["dry-run"] && config.LEGAL_STORE === "memory") {
  logger.error("LEGAL_STORE=memory keeps nothing between runs; set LEGAL_STORE=pgvector");
  process.exit(1);
}

const store = args["dry-run"] ? null : await createLegalStore(config, logger);
const embedder = createEmbedder(config);
const totals = { sections: 0, upserted: 0, unchanged: 0, skipped: 0 };

const failed: string[] = [];
for (const code of requested as ActCode[]) {
  try {
    await ingestAct(code);
  } catch (err) {
    // One act failing (network, database) shouldn't stop the others; re-running resumes.
    failed.push(code.toLowerCase());
    logger.error(`${ACTS[code].name}: failed: ${(err as Error).message}`);
  }
}

async function ingestAct(code: ActCode): Promise<void> {
  const sections = await fetchActSections(INDIA_CODE_ACTS[code]!);
  const records = sections.map((s) => toStatuteRecord(code, s)).filter((r) => r !== null);
  // India Code occasionally lists a section twice (e.g. an amended version); keep the last.
  const unique = [...new Map(records.map((r) => [r.source_id, StatuteRecord.parse(r)])).values()];
  const skipped = sections.length - unique.length;
  totals.sections += unique.length;
  totals.skipped += skipped;

  if (!store) {
    logger.info(`${ACTS[code].name}: ${unique.length} sections (${skipped} omitted/duplicate skipped)`);
    return;
  }
  const result = await ingestSources(prepareRecords({ statutes: unique, cases: [] }), { store, embedder });
  totals.upserted += result.upserted;
  totals.unchanged += result.unchanged;
  logger.info(`${ACTS[code].name}: ${result.upserted} stored, ${result.unchanged} unchanged, ${skipped} omitted/duplicate skipped`);
}

if (failed.length) logger.warn(`re-run to finish: npm run ingest:statutes -- --acts ${failed.join(",")}`);
if (store) {
  logger.info({ ...totals, librarySources: await store.countSources() }, "statute ingestion complete");
  await store.close();
} else {
  logger.info(totals, "dry run: nothing stored");
}
