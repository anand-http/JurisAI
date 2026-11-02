import type { RequestHandler } from "express";
import { Types } from "mongoose";
import type { Config } from "../../config/env.js";
import { HttpError, unauthorized } from "../../lib/errors.js";
import { UsageModel } from "../../models/usage.model.js";
import { UserModel, type Plan, type User } from "../../models/user.model.js";

const PERIOD_FORMAT = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit" });

/** Quota month in IST, "YYYY-MM". */
export const currentPeriod = (now = new Date()) => PERIOD_FORMAT.format(now);

/** Grace for a delayed renewal webhook before a lapsed pro plan is treated as free. */
const RENEWAL_GRACE_MS = 3 * 24 * 60 * 60 * 1000;

export function effectivePlan(user: Pick<User, "plan" | "planRenewsAt">, now = new Date()): Plan {
  if (user.plan === "pro" && user.planRenewsAt && user.planRenewsAt.getTime() + RENEWAL_GRACE_MS < now.getTime()) {
    return "free";
  }
  return user.plan;
}

export const draftLimitFor = (plan: Plan, config: Config) =>
  plan === "pro" ? config.PRO_DRAFTS_PER_MONTH : config.FREE_DRAFTS_PER_MONTH;

/** Atomically takes one draft from this month's allowance. Returns false when the allowance is used up. */
export async function reserveDraft(userId: string, period: string, limit: number): Promise<boolean> {
  const filter = { userId: new Types.ObjectId(userId), period };
  try {
    await UsageModel.updateOne(filter, { $setOnInsert: { draftsGenerated: 0 } }, { upsert: true });
  } catch (err) {
    if ((err as { code?: number }).code !== 11000) throw err; // concurrent upsert of the same row
  }
  const updated = await UsageModel.findOneAndUpdate(
    { ...filter, draftsGenerated: { $lt: limit } },
    { $inc: { draftsGenerated: 1 } },
    { returnDocument: "after" },
  );
  return updated !== null;
}

/** Refund a reservation when generation fails. */
export async function releaseDraft(userId: string, period: string): Promise<void> {
  await UsageModel.updateOne(
    { userId: new Types.ObjectId(userId), period, draftsGenerated: { $gt: 0 } },
    { $inc: { draftsGenerated: -1 } },
  );
}

export async function getUsage(userId: string, period = currentPeriod()): Promise<number> {
  const usage = await UsageModel.findOne({ userId: new Types.ObjectId(userId), period }).lean();
  return usage?.draftsGenerated ?? 0;
}

export interface QuotaReservation {
  period: string;
  release: () => Promise<void>;
}

/**
 * Checks and reserves draft quota before /drafts/generate runs. The handler must call
 * `res.locals.quota.release()` if generation fails so a failed draft doesn't consume quota.
 */
export function draftQuota(config: Config): RequestHandler {
  return async (req, res, next) => {
    const userId = req.auth?.userId;
    if (!userId) throw unauthorized();
    const user = await UserModel.findById(userId).select({ plan: 1, planRenewsAt: 1 }).lean();
    if (!user) throw unauthorized("Account not found");

    const plan = effectivePlan(user);
    const limit = draftLimitFor(plan, config);
    const period = currentPeriod();
    if (!(await reserveDraft(userId, period, limit))) {
      throw new HttpError(402, "quota_exceeded", `Monthly draft limit reached for the ${plan} plan`, {
        plan,
        limit,
        used: await getUsage(userId, period),
        period,
      });
    }
    const reservation: QuotaReservation = { period, release: () => releaseDraft(userId, period) };
    res.locals.quota = reservation;
    next();
  };
}
