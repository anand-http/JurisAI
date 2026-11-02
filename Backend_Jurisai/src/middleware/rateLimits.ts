import { rateLimit, type Options } from "express-rate-limit";
import type { Config } from "../config/env.js";

// In-memory stores are per process. Behind more than one instance, plug in a shared
// store (e.g. rate-limit-redis) via the `store` option so limits hold across instances.
const common: Partial<Options> = {
  standardHeaders: "draft-8",
  legacyHeaders: false,
  handler: (_req, res, _next, options) => {
    res.status(options.statusCode).json({ error: { code: "rate_limited", message: "Too many requests, slow down" } });
  },
};

const userKey = (req: Express.Request) => req.auth?.userId ?? "anonymous";
const emailKey = (req: Express.Request & { body?: { email?: unknown } }) =>
  String(req.body?.email ?? "").trim().toLowerCase() || "no-email";

export function createRateLimiters(config: Config) {
  return {
    /**
     * Per-IP ceiling across all /auth routes. Kept loose because a whole chamber or court
     * complex can share one IP; the per-email limits below are what protect each account.
     */
    authIp: rateLimit({ ...common, windowMs: 15 * 60 * 1000, limit: config.AUTH_RATE_LIMIT_PER_IP }),

    /** Per-email code sends: stops someone flooding one inbox from many IPs. */
    otpPerEmail: rateLimit({ ...common, windowMs: 60 * 60 * 1000, limit: 5, keyGenerator: emailKey }),

    /** Per-email password attempts: slows guessing against one account from many IPs. */
    loginPerEmail: rateLimit({ ...common, windowMs: 15 * 60 * 1000, limit: 10, keyGenerator: emailKey }),

    /** Per-user cap on the expensive LLM route, independent of monthly quota. */
    generate: rateLimit({
      ...common,
      windowMs: config.GENERATE_RATE_LIMIT_WINDOW_SECONDS * 1000,
      limit: config.GENERATE_RATE_LIMIT_MAX,
      keyGenerator: userKey,
    }),

    export: rateLimit({ ...common, windowMs: 10 * 60 * 1000, limit: 20, keyGenerator: userKey }),
  };
}

export type RateLimiters = ReturnType<typeof createRateLimiters>;
