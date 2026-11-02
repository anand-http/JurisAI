import type { ActCode } from "./acts.js";

/**
 * One row of the citation lookup table. `sourceId` is the unique key the LLM must cite
 * and the key post-generation verification checks against.
 */
export type LegalSource = StatuteSource | CaseSource;

interface BaseSource {
  sourceId: string;
  /** Full original text shown in the "tap to verify" UI. */
  text: string;
  sourceUrl: string;
  /** sha256 of the canonical content; unchanged sources are not re-embedded on re-ingestion. */
  contentHash: string;
}

export interface StatuteSource extends BaseSource {
  sourceType: "statute";
  actCode: ActCode;
  actName: string;
  sectionNumber: string; // "420", "498A", "318(4)"
  sectionTitle: string;
}

export interface CaseSource extends BaseSource {
  sourceType: "case";
  caseName: string;
  court: string;
  decisionDate: string; // ISO yyyy-mm-dd
  citationText: string; // "(2014) 8 SCC 273"
}

/** Retrieval unit. Statute sections are one chunk; long judgments are split into several. */
export interface SourceChunk {
  chunkId: string;
  sourceId: string;
  text: string;
}

export interface EmbeddedChunk extends SourceChunk {
  embedding: number[];
}

export interface ChunkHit extends SourceChunk {
  /** Cosine similarity, higher is closer. */
  score: number;
}
