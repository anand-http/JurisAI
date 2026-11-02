import type { Embedder } from "../../legal/embeddings.js";
import type { LegalStore } from "../../legal/legalStore.js";
import type { LegalSource } from "../../legal/types.js";

export interface RetrievedSource {
  source: LegalSource;
  score: number;
  /** What the model sees: the full section for statutes, the matched excerpts for cases. */
  passages: string[];
}

export interface RetrieveOptions {
  topK: number;
  minScore: number;
}

/** Step 2: embed the query, search the vector index, and group chunk hits into top-k sources. */
export async function retrieveContext(
  query: string,
  opts: RetrieveOptions,
  deps: { store: LegalStore; embedder: Embedder },
): Promise<RetrievedSource[]> {
  const [embedding] = await deps.embedder.embed([query], "query");
  if (!embedding) throw new Error("embedder returned no vector for the query");

  // Over-fetch chunks: several chunks of one judgment should not crowd out other sources.
  const hits = await deps.store.search(embedding, opts.topK * 3);

  const grouped = new Map<string, { score: number; chunkTexts: string[] }>();
  for (const hit of hits) {
    if (hit.score < opts.minScore) continue;
    const entry = grouped.get(hit.sourceId);
    if (entry) {
      if (entry.chunkTexts.length < 2) entry.chunkTexts.push(hit.text);
    } else {
      grouped.set(hit.sourceId, { score: hit.score, chunkTexts: [hit.text] });
    }
  }

  const top = [...grouped.entries()].sort((a, b) => b[1].score - a[1].score).slice(0, opts.topK);
  const sources = await deps.store.getSources(top.map(([id]) => id));

  return top.flatMap(([id, { score, chunkTexts }]) => {
    const source = sources.get(id);
    if (!source) return []; // chunk without a lookup row; never offer it as citable
    return [{ source, score, passages: source.sourceType === "statute" ? [source.text] : chunkTexts }];
  });
}
