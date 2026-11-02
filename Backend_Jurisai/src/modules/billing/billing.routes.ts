import express, { Router } from "express";
import { Types } from "mongoose";
import type { Logger } from "pino";
import type { Config } from "../../config/env.js";
import { HttpError } from "../../lib/errors.js";
import { authUserId } from "../../middleware/auth.js";
import { SubscriptionModel } from "../../models/subscription.model.js";
import { UserModel } from "../../models/user.model.js";
import { currentPeriod, draftLimitFor, effectivePlan, getUsage } from "./quota.js";
import { verifyWebhookSignature, type RazorpayGateway } from "./razorpay.js";
import { handleRazorpayEvent, RazorpayWebhookPayload } from "./webhook.js";

export interface BillingDeps {
  config: Config;
  razorpay: RazorpayGateway | null;
  logger: Logger;
}

const LIVE_STATUSES = ["created", "authenticated", "active", "pending"] as const;

/** Mounted behind requireAuth at /subscriptions. */
export function subscriptionsRouter(deps: BillingDeps): Router {
  const router = Router();
  const { config } = deps;

  /** Creates a Razorpay subscription; the client opens Razorpay Checkout with subscriptionId + keyId. */
  router.post("/", async (req, res) => {
    if (!deps.razorpay || !config.RAZORPAY_PRO_PLAN_ID || !config.RAZORPAY_KEY_ID) {
      throw new HttpError(503, "billing_unavailable", "Payments are not configured");
    }
    const userId = authUserId(req);

    const live = await SubscriptionModel.findOne({ userId, status: { $in: LIVE_STATUSES } }).lean();
    if (live?.status === "active" || live?.status === "pending") {
      throw new HttpError(409, "already_subscribed", "You already have an active subscription");
    }
    // An unpaid checkout from earlier can be resumed instead of creating a second subscription.
    if (live) {
      res.json({ subscriptionId: live.razorpaySubscriptionId, keyId: config.RAZORPAY_KEY_ID, status: live.status });
      return;
    }

    const sub = await deps.razorpay.createSubscription({
      planId: config.RAZORPAY_PRO_PLAN_ID,
      totalCount: config.RAZORPAY_PRO_TOTAL_COUNT,
      userId,
    });
    await SubscriptionModel.create({
      userId: new Types.ObjectId(userId),
      razorpaySubscriptionId: sub.id,
      razorpayPlanId: config.RAZORPAY_PRO_PLAN_ID,
      status: "created",
    });
    res.status(201).json({ subscriptionId: sub.id, keyId: config.RAZORPAY_KEY_ID, status: "created", shortUrl: sub.shortUrl });
  });

  /** Plan and quota status; the client polls this after checkout until the webhook activates the plan. */
  router.get("/me", async (req, res) => {
    const userId = authUserId(req);
    const [user, subscription] = await Promise.all([
      UserModel.findById(userId).select({ plan: 1, planRenewsAt: 1 }).lean(),
      SubscriptionModel.findOne({ userId }).sort({ createdAt: -1 }).lean(),
    ]);
    if (!user) throw new HttpError(401, "unauthorized", "Account not found");
    const plan = effectivePlan(user);
    const period = currentPeriod();
    res.json({
      plan,
      renewsAt: user.planRenewsAt ?? null,
      subscription: subscription
        ? { subscriptionId: subscription.razorpaySubscriptionId, status: subscription.status, currentEnd: subscription.currentEnd ?? null }
        : null,
      usage: { period, draftsGenerated: await getUsage(userId, period), limit: draftLimitFor(plan, config) },
    });
  });

  return router;
}

/** Mounted at /webhooks/razorpay BEFORE express.json(): the signature is over the raw body. */
export function razorpayWebhookRouter(deps: BillingDeps): Router {
  const router = Router();
  router.post("/", express.raw({ type: "application/json", limit: "1mb" }), async (req, res) => {
    const secret = deps.config.RAZORPAY_WEBHOOK_SECRET;
    if (!secret) throw new HttpError(503, "billing_unavailable", "Webhook secret not configured");

    const raw = req.body as Buffer;
    if (!Buffer.isBuffer(raw) || !verifyWebhookSignature(raw, req.header("x-razorpay-signature"), secret)) {
      deps.logger.warn({ ip: req.ip }, "razorpay webhook with invalid signature");
      throw new HttpError(400, "invalid_signature", "Invalid webhook signature");
    }

    const payload = RazorpayWebhookPayload.parse(JSON.parse(raw.toString("utf8")));
    const eventId = req.header("x-razorpay-event-id") ?? `${payload.event}:${payload.created_at}:${payload.payload.subscription?.entity.id ?? ""}`;
    const result = await handleRazorpayEvent(eventId, payload, deps.logger);
    res.json({ ok: true, result });
  });
  return router;
}
