import { Schema, model, type Types } from "mongoose";

/** Mirrors Razorpay's subscription lifecycle states. */
export const SUBSCRIPTION_STATUSES = [
  "created",
  "authenticated",
  "active",
  "pending",
  "halted",
  "paused",
  "cancelled",
  "completed",
  "expired",
] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

export interface Subscription {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  razorpaySubscriptionId: string;
  razorpayPlanId: string;
  status: SubscriptionStatus;
  currentStart?: Date;
  currentEnd?: Date;
  lastPaymentId?: string;
  /** Razorpay event `created_at` (unix seconds) of the last applied webhook, to drop out-of-order deliveries. */
  lastEventAt: number;
  createdAt: Date;
  updatedAt: Date;
}

const subscriptionSchema = new Schema<Subscription>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    razorpaySubscriptionId: { type: String, required: true, unique: true },
    razorpayPlanId: { type: String, required: true },
    status: { type: String, enum: SUBSCRIPTION_STATUSES, required: true },
    currentStart: Date,
    currentEnd: Date,
    lastPaymentId: String,
    lastEventAt: { type: Number, default: 0 },
  },
  { timestamps: true },
);

export const SubscriptionModel = model<Subscription>("Subscription", subscriptionSchema);
