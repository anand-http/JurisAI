/**
 * Loads Supreme Court judgments from the open dataset into the legal library.
 *
 *   npm run ingest:sc -- --dry-run                           # what would be loaded (no PDFs)
 *   npm run ingest:sc -- --from 2023 --to 2025 --limit 100
 *   npm run ingest:sc -- --topics cheque,bail --limit 50
 *   npm run ingest:sc -- --from 2015 --to 2022 --scan-pdfs   # older years: screen PDFs by headnotes
 *
 * Topics: bail, quashing, fir, cheque, contract, tenancy, affidavit (default: all).
 * Metadata from mid-2023 carries an official "Issue for Consideration", so topics are matched
 * without downloading anything. Older judgments only have a title; --scan-pdfs downloads
 * them and matches on the headnotes instead. --limit counts judgments actually loaded.
 *
 * Safe to re-run: judgments already in the library are not downloaded again, and when the
 * embedding model changes they are re-embedded from the text already stored.
 */
import { parseArgs } from "node:util";
import { loadConfig } from "../config/env.js";
import { createLogger } from "../lib/logger.js";
import { createEmbedder, createLegalStore } from "../modules/legal/factory.js";
import { ingestSources } from "./ingestSources.js";
import { CaseRecord, prepareRecords } from "./records.js";
import {
  SC_ATTRIBUTION,
  TOPICS,
  chunkText,
  cleanJudgmentText,
  extractPages,
  fetchYearMetadata,
  headnoteText,
  issueForConsideration,
  matchTopics,
  matchTopicsInText,
  pdfUrl,
  sourceIdFor,
  toCaseRecord,
  type ScMetadataRow,
} from "./sources/supremeCourt.js";

const { values: args } = parseArgs({
  options: {
    from: { type: "string", default: "2023" },
    to: { type: "string", default: String(new Date().getFullYear()) },
    topics: { type: "string", default: Object.keys(TOPICS).join(",") },
    limit: { type: "string", default: "50" },
    concurrency: { type: "string", default: "3" },
    "scan-pdfs": { type: "boolean", default: false },
    "dry-run": { type: "boolean", default: false },
  },
});

const config = loadConfig();
const logger = createLogger(config.LOG_LEVEL, config.NODE_ENV === "development");
const topics = args.topics.split(",").map((t) => t.trim()).filter(Boolean);
const unknown = topics.filter((t) => !TOPICS[t]);
if (unknown.length) {
  logger.error(`unknown topic(s): ${unknown.join(", ")}. Available: ${Object.keys(TOPICS).join(", ")}`);
  process.exit(1);
}
const limit = Number(args.limit);

// 1. Screen each year's metadata (small parquet files). Judgments without an official summary
//    can only be screened by downloading them, which --scan-pdfs allows.
interface Item {
  row: ScMetadataRow;
  topics: string[];
  screenPdf: boolean;
}
const queue: Item[] = [];
let unscreened = 0;
for (let year = Number(args.to); year >= Number(args.from); year--) {
  const rows = await fetchYearMetadata(year).catch((err: Error) => {
    logger.warn(`year ${year}: ${err.message}`);
    return [] as ScMetadataRow[];
  });
  let matched = 0;
  let noSummary = 0;
  for (const row of rows) {
    const t = matchTopics(row, topics);
    if (t.length > 0) {
      matched++;
      queue.push({ row, topics: t, screenPdf: false });
    } else if (!issueForConsideration(row)) {
      noSummary++;
      if (args["scan-pdfs"]) queue.push({ row, topics: [], screenPdf: true });
    }
  }
  unscreened += noSummary;
  logger.info(`year ${year}: ${matched} of ${rows.length} match by summary; ${noSummary} have no summary`);
}

if (args["dry-run"]) {
  const ready = queue.filter((q) => !q.screenPdf);
  const byTopic = Object.fromEntries(topics.map((t) => [t, ready.filter((c) => c.topics.includes(t)).length]));
  logger.info(
    {
      matchedBySummary: ready.length,
      withoutSummary: unscreened,
      wouldLoad: Math.min(limit, args["scan-pdfs"] ? queue.length : ready.length),
      byTopic,
    },
    args["scan-pdfs"] || unscreened === 0
      ? "dry run: nothing downloaded"
      : "dry run: nothing downloaded (add --scan-pdfs to screen judgments without a summary by their headnotes)",
  );
  for (const { row, topics: t } of ready.slice(0, 20)) console.log(`  ${row.decision_date}  ${row.title.slice(0, 90)}  [${t.join(", ")}]`);
  process.exit(0);
}

if (config.LEGAL_STORE === "memory") {
  logger.error("LEGAL_STORE=memory keeps nothing between runs; set LEGAL_STORE=pgvector");
  process.exit(1);
}

// 2. Download, extract, chunk, embed and store, a few at a time, until --limit are loaded.
const store = await createLegalStore(config, logger);
const embedder = createEmbedder(config);
const existing = await store.getSources(queue.filter((q) => !q.screenPdf).map((q) => sourceIdFor(q.row)));
const stats = { loaded: 0, reembedded: 0, unchanged: 0, screenedOut: 0, failed: 0 };
// Slots are claimed before storing, so parallel workers can't overshoot --limit.
let claimed = 0;
const done = () => claimed >= limit;

async function ingestOne(item: Item): Promise<void> {
  const { row } = item;
  const id = sourceIdFor(row);
  try {
    let excerpts: string[];
    const stored = existing.get(id);
    if (stored?.sourceType === "case") {
      // Already downloaded once: rebuild from the stored text (re-embeds only if the model changed).
      excerpts = stored.text.split("\n\n");
    } else {
      const res = await fetch(pdfUrl(row), { signal: AbortSignal.timeout(90_000) });
      if (!res.ok) throw new Error(`PDF HTTP ${res.status}`);
      const pages = await extractPages(new Uint8Array(await res.arrayBuffer()));
      if (item.screenPdf && matchTopicsInText(headnoteText(pages), topics).length === 0) {
        stats.screenedOut++;
        return;
      }
      excerpts = chunkText(cleanJudgmentText(pages));
    }
    const record = toCaseRecord(row, excerpts);
    if (!record) throw new Error("missing date, citation or text");
    if (done()) return;
    claimed++;
    const result = await ingestSources(prepareRecords({ statutes: [], cases: [CaseRecord.parse(record)] }), { store, embedder }).catch(
      (err: unknown) => {
        claimed--; // give the slot back so another judgment can take it
        throw err;
      },
    );
    if (result.unchanged) stats.unchanged++;
    else if (stored) stats.reembedded++;
    else stats.loaded++;
    const n = stats.loaded + stats.reembedded + stats.unchanged;
    logger.info(`[${n}/${limit}] ${id} ${record.case_name.slice(0, 70)}: ${excerpts.length} chunks${result.unchanged ? " (unchanged)" : ""}`);
  } catch (err) {
    stats.failed++;
    logger.warn(`${id} failed: ${(err as Error).message}`);
  }
}

let next = 0;
await Promise.all(
  Array.from({ length: Math.max(1, Number(args.concurrency)) }, async () => {
    while (next < queue.length && !done()) await ingestOne(queue[next++]!);
  }),
);

const total = await store.countSources();
await store.close();
logger.info({ ...stats, librarySources: total, attribution: SC_ATTRIBUTION }, "supreme court ingestion complete");
