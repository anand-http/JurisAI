import type { Logger } from "pino";
import { z } from "zod";
import { SUBSCRIPTION_STATUSES, SubscriptionModel } from "../../models/subscription.model.js";
import { UserModel } from "../../models/user.model.js";
import { WebhookEventModel } from "../../models/webhookEvent.model.js";
import { planForStatus } from "./razorpay.js";

const unixToDate = (s: number | null | undefined) => (s ? new Date(s * 1000) : undefined);

/** Only the fields this service reads; Razorpay payloads carry many more. */
export const RazorpayWebhookPayload = z.object({
  event: z.string(),
  created_at: z.number(),
  payload: z.object({
    subscription: z
      .object({
        entity: z.object({
          id: z.string(),
          status: z.enum(SUBSCRIPTION_STATUSES),
          current_start: z.number().nullish(),
          current_end: z.number().nullish(),
        }),
      })
      .optional(),
    payment: z.object({ entity: z.object({ id: z.string() }) }).optional(),
  }),
});
export type RazorpayWebhookPayload = z.infer<typeof RazorpayWebhookPayload>;

export type WebhookResult = "applied" | "duplicate" | "ignored" | "stale" | "unknown_subscription";

/**
 * Applies a verified Razorpay webhook. Idempotent per event id, and ignores events older
 * than the last one applied to the subscription (Razorpay does not guarantee ordering).
 * The entity's `status` field, not the event name, decides the resulting state.
 */
export async function handleRazorpayEvent(eventId: string, body: RazorpayWebhookPayload, logger: Logger): Promise<WebhookResult> {
  try {
    await WebhookEventModel.create({ eventId, event: body.event });
  } catch (err) {
    if ((err as { code?: number }).code === 11000) return "duplicate";
    throw err;
  }
  try {
    return await applyEvent(body, logger);
  } catch (err) {
    // Un-record the event so Razorpay's retry is processed rather than dropped as a duplicate.
    await WebhookEventModel.deleteOne({ eventId });
    throw err;
  }
}

async function applyEvent(body: RazorpayWebhookPayload, logger: Logger): Promise<WebhookResult> {
  const entity = body.payload.subscription?.entity;
  if (!body.event.startsWith("subscription.") || !entity) return "ignored";

  const sub = await SubscriptionModel.findOneAndUpdate(
    { razorpaySubscriptionId: entity.id, lastEventAt: { $lte: body.created_at } },
    {
      $set: {
        status: entity.status,
        currentStart: unixToDate(entity.current_start),
        currentEnd: unixToDate(entity.current_end),
        lastEventAt: body.created_at,
        ...(body.payload.payment ? { lastPaymentId: body.payload.payment.entity.id } : {}),
      },
    },
    { returnDocument: "after" },
  ).lean();

  if (!sub) {
    const exists = await SubscriptionModel.exists({ razorpaySubscriptionId: entity.id });
    if (exists) return "stale";
    logger.warn({ event: body.event, subscriptionId: entity.id }, "webhook for unknown subscription");
    return "unknown_subscription";
  }

  const plan = planForStatus(sub.status);
  await UserModel.updateOne(
    { _id: sub.userId },
    plan === "pro" ? { $set: { plan, planRenewsAt: sub.currentEnd } } : { $set: { plan }, $unset: { planRenewsAt: 1 } },
  );
  logger.info({ event: body.event, subscriptionId: entity.id, status: sub.status, plan, userId: sub.userId.toString() }, "subscription updated");
  return "applied";
}
