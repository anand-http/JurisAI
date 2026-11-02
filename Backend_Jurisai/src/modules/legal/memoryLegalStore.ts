import type { LegalStore } from "./legalStore.js";
import type { ChunkHit, EmbeddedChunk, LegalSource } from "./types.js";

/** In-process store for local development and tests. Brute-force cosine search. */
export class MemoryLegalStore implements LegalStore {
  private readonly sources = new Map<string, LegalSource>();
  private chunks: EmbeddedChunk[] = [];

  async upsertSource(source: LegalSource, chunks: EmbeddedChunk[]): Promise<void> {
    this.sources.set(source.sourceId, source);
    this.chunks = this.chunks.filter((c) => c.sourceId !== source.sourceId).concat(chunks);
  }

  async search(queryEmbedding: number[], k: number): Promise<ChunkHit[]> {
    return this.chunks
      .map(({ embedding, ...chunk }) => ({ ...chunk, score: cosine(queryEmbedding, embedding) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, k);
  }

  async getSources(sourceIds: string[]): Promise<Map<string, LegalSource>> {
    const out = new Map<string, LegalSource>();
    for (const id of sourceIds) {
      const source = this.sources.get(id);
      if (source) out.set(id, source);
    }
    return out;
  }

  async countSources(): Promise<number> {
    return this.sources.size;
  }

  async close(): Promise<void> {}
}

function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}
