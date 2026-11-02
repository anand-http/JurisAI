import { createHmac, timingSafeEqual } from "node:crypto";
import Razorpay from "razorpay";
import type { SubscriptionStatus } from "../../models/subscription.model.js";
import type { Plan } from "../../models/user.model.js";

/** The subset of the Razorpay SDK this service uses, so tests can substitute a fake. */
export interface RazorpayGateway {
  createSubscription(params: { planId: string; totalCount: number; userId: string }): Promise<{ id: string; status: string; shortUrl: string }>;
}

export class RazorpaySdkGateway implements RazorpayGateway {
  private readonly client: Razorpay;

  constructor(keyId: string, keySecret: string) {
    this.client = new Razorpay({ key_id: keyId, key_secret: keySecret });
  }

  async createSubscription(params: { planId: string; totalCount: number; userId: string }) {
    const sub = await this.client.subscriptions.create({
      plan_id: params.planId,
      total_count: params.totalCount,
      customer_notify: 1,
      notes: { userId: params.userId },
    });
    return { id: sub.id, status: sub.status, shortUrl: sub.short_url };
  }
}

/** Razorpay signs the raw request body with the webhook secret (HMAC-SHA256, hex). */
export function verifyWebhookSignature(rawBody: Buffer, signature: string | undefined, secret: string): boolean {
  if (!signature) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(signature, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Paid access follows Razorpay's subscription status. `pending` (a renewal charge is being
 * retried) keeps access; `halted` (retries exhausted), `cancelled`, `completed`, `expired`
 * and `paused` drop the user to free.
 */
export function planForStatus(status: SubscriptionStatus): Plan {
  return status === "active" || status === "pending" ? "pro" : "free";
}
