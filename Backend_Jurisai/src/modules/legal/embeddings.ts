export type EmbeddingInputType = "query" | "document";

export interface Embedder {
  /** Identifies the model; vectors from different ids must never be mixed in one index. */
  readonly id: string;
  readonly dimensions: number;
  embed(texts: string[], inputType: EmbeddingInputType): Promise<number[][]>;
}

/**
 * Voyage AI embeddings. `voyage-law-2` is trained for legal retrieval (1024 dims).
 * Query and document inputs are embedded asymmetrically via `input_type`.
 */
export class VoyageEmbedder implements Embedder {
  private static readonly BATCH_SIZE = 64;
  readonly id: string;

  constructor(
    private readonly apiKey: string,
    private readonly model: string,
    readonly dimensions: number,
  ) {
    this.id = `voyage:${model}:${dimensions}`;
  }

  async embed(texts: string[], inputType: EmbeddingInputType): Promise<number[][]> {
    const out: number[][] = [];
    for (let i = 0; i < texts.length; i += VoyageEmbedder.BATCH_SIZE) {
      out.push(...(await this.embedBatch(texts.slice(i, i + VoyageEmbedder.BATCH_SIZE), inputType)));
    }
    return out;
  }

  private async embedBatch(input: string[], inputType: EmbeddingInputType, attempt = 1): Promise<number[][]> {
    const res = await fetch("https://api.voyageai.com/v1/embeddings", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify({ input, model: this.model, input_type: inputType }),
      signal: AbortSignal.timeout(30_000),
    });
    if ((res.status === 429 || res.status >= 500) && attempt < 4) {
      await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
      return this.embedBatch(input, inputType, attempt + 1);
    }
    if (!res.ok) throw new Error(`Voyage embeddings failed: HTTP ${res.status}`);

    const body = (await res.json()) as { data: { embedding: number[]; index: number }[] };
    const vectors = body.data.sort((a, b) => a.index - b.index).map((d) => d.embedding);
    if (vectors.some((v) => v.length !== this.dimensions)) {
      throw new Error(`Voyage returned vectors of unexpected size; expected ${this.dimensions} (check EMBEDDING_DIM)`);
    }
    return vectors;
  }
}

const STOPWORDS = new Set(
  "a an and are as at be by for from has have in is it its of on or that the this to was were which with shall any such who whom whose under".split(
    " ",
  ),
);

/**
 * Development/test only: deterministic feature-hashing of word unigrams and bigrams.
 * Gives lexical-overlap retrieval without any API key. Not semantically meaningful;
 * config refuses it in production.
 */
export class HashingEmbedder implements Embedder {
  readonly id: string;

  constructor(readonly dimensions: number) {
    this.id = `hash:${dimensions}`;
  }

  async embed(texts: string[]): Promise<number[][]> {
    return texts.map((t) => this.embedOne(t));
  }

  private embedOne(text: string): number[] {
    const vec = new Array<number>(this.dimensions).fill(0);
    const tokens = text
      .toLowerCase()
      .replace(/\./g, "")
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length > 1 && !STOPWORDS.has(t));
    const features = [...tokens, ...tokens.slice(1).map((t, i) => `${tokens[i]}_${t}`)];
    for (const feature of features) {
      const h = fnv1a(feature);
      vec[h % this.dimensions]! += h & 0x80000000 ? -1 : 1;
    }
    const norm = Math.hypot(...vec) || 1;
    return vec.map((v) => v / norm);
  }
}

function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
