import type { SeedFile } from "./records.js";

/**
 * Source providers produce records in the seed-file shape, which ingestSources() then
 * chunks, embeds and upserts. Only the seed provider is implemented in this build.
 */
export interface SourceProvider {
  readonly name: string;
  fetchRecords(): Promise<SeedFile>;
}

/**
 * TODO(ingestion): parse India Code (indiacode.nic.in) bare acts into section-level records.
 * source_id convention: `${act_code.toLowerCase()}-s${section}` with sub-section brackets
 * flattened, e.g. "ipc-s498a", "bns-s318-4". source_url should be the India Code section URL.
 */
export class IndiaCodeProvider implements SourceProvider {
  readonly name = "india-code";
  async fetchRecords(): Promise<SeedFile> {
    throw new Error("IndiaCodeProvider is not implemented yet (out of scope for this build)");
  }
}

/**
 * TODO(ingestion): pull judgments from the Indian Kanoon API (api.indiankanoon.org, token auth),
 * split each judgment into paragraph-level excerpts, and emit one case record per judgment.
 * source_id convention: `ik-${docid}`; source_url: `https://indiankanoon.org/doc/${docid}/`.
 */
export class IndianKanoonProvider implements SourceProvider {
  readonly name = "indian-kanoon";
  async fetchRecords(): Promise<SeedFile> {
    throw new Error("IndianKanoonProvider is not implemented yet (out of scope for this build)");
  }
}
