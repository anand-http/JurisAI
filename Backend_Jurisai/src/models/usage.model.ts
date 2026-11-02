import { Schema, model, type Types } from "mongoose";

/** Drafts generated per user per calendar month (IST). Deleting a draft does not refund quota. */
export interface Usage {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  period: string; // "YYYY-MM" in Asia/Kolkata
  draftsGenerated: number;
}

const usageSchema = new Schema<Usage>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    period: { type: String, required: true },
    draftsGenerated: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true },
);

usageSchema.index({ userId: 1, period: 1 }, { unique: true });

export const UsageModel = model<Usage>("Usage", usageSchema);
