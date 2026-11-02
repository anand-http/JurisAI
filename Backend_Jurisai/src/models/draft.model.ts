import { Schema, model, type HydratedDocument, type Types } from "mongoose";

export type VerificationReason =
  | "verified"
  | "unknown_source_id"
  | "not_in_retrieved_context"
  | "claim_mismatch"
  | "unsupported_by_source";

export type SupportVerdict = "supported" | "partially_supported" | "unsupported" | "not_checked";

export interface DraftCitation {
  sourceId: string;
  text: string;
  claimedSection: string;
  verified: boolean;
  reason: VerificationReason;
  detail?: string;
  /** Result of the independent source-support check, for citations that passed lookup. */
  support?: SupportVerdict;
}

export interface UnlinkedMention {
  /** Verbatim text in the draft, so clients can highlight it. */
  mention: string;
  kind: "statute" | "case";
  /** Resolved form, e.g. "Section 41A, Code of Criminal Procedure, 1973". */
  reference?: string;
}

export interface DraftExport {
  key: string;
  format: "docx";
  createdAt: Date;
  /** Open review issues the lawyer acknowledged to export (audit trail). */
  acknowledgedIssues: number;
  issueTypes: string[];
}

export interface Draft {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  documentType: string;
  formFields: Record<string, string>;
  /** Current text, including the lawyer's manual edits. */
  draftText: string;
  /** Immutable model output, kept for audit and so edits can be diffed later. */
  generatedText: string;
  citations: DraftCitation[];
  unlinkedMentions: UnlinkedMention[];
  mentionScan: "completed" | "skipped" | "failed";
  supportCheck: "completed" | "skipped" | "failed";
  retrieval: { sourceIds: string[]; scores: number[]; topK: number };
  llm: { model: string; inputTokens: number; outputTokens: number; stopReason: string | null };
  status: "generated" | "edited";
  editedAt?: Date;
  exports: DraftExport[];
  createdAt: Date;
  updatedAt: Date;
}

const citationSchema = new Schema<DraftCitation>(
  {
    sourceId: { type: String, required: true },
    text: { type: String, required: true },
    claimedSection: { type: String, required: true },
    verified: { type: Boolean, required: true },
    reason: {
      type: String,
      enum: ["verified", "unknown_source_id", "not_in_retrieved_context", "claim_mismatch", "unsupported_by_source"],
      required: true,
    },
    detail: String,
    support: { type: String, enum: ["supported", "partially_supported", "unsupported", "not_checked"] },
  },
  { _id: false },
);

const draftSchema = new Schema<Draft>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    documentType: { type: String, required: true },
    formFields: { type: Schema.Types.Mixed, required: true },
    draftText: { type: String, required: true },
    generatedText: { type: String, required: true },
    citations: { type: [citationSchema], default: [] },
    unlinkedMentions: {
      type: [new Schema<UnlinkedMention>({ mention: String, kind: String, reference: String }, { _id: false })],
      default: [],
    },
    mentionScan: { type: String, enum: ["completed", "skipped", "failed"], required: true },
    supportCheck: { type: String, enum: ["completed", "skipped", "failed"], default: "skipped" },
    retrieval: {
      sourceIds: { type: [String], default: [] },
      scores: { type: [Number], default: [] },
      topK: { type: Number, required: true },
    },
    llm: {
      model: { type: String, required: true },
      inputTokens: { type: Number, default: 0 },
      outputTokens: { type: Number, default: 0 },
      stopReason: { type: String, default: null },
    },
    status: { type: String, enum: ["generated", "edited"], default: "generated" },
    editedAt: Date,
    exports: {
      type: [
        new Schema<DraftExport>(
          { key: String, format: String, createdAt: Date, acknowledgedIssues: Number, issueTypes: [String] },
          { _id: false },
        ),
      ],
      default: [],
    },
  },
  { timestamps: true, minimize: false },
);

draftSchema.index({ userId: 1, createdAt: -1 });

export const DraftModel = model<Draft>("Draft", draftSchema);
export type DraftDoc = HydratedDocument<Draft>;
