import { Schema, model } from "mongoose";

/** Idempotency ledger for Razorpay webhooks (Razorpay retries deliveries). */
export interface WebhookEvent {
  eventId: string;
  event: string;
  receivedAt: Date;
}

const webhookEventSchema = new Schema<WebhookEvent>({
  eventId: { type: String, required: true, unique: true },
  event: { type: String, required: true },
  receivedAt: { type: Date, default: () => new Date() },
});

webhookEventSchema.index({ receivedAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 30 });

export const WebhookEventModel = model<WebhookEvent>("WebhookEvent", webhookEventSchema);
