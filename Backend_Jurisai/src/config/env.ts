import { z } from "zod";

const bool = z
  .enum(["true", "false", "1", "0"])
  .transform((v) => v === "true" || v === "1");

const EnvSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().int().positive().default(4000),
    APP_NAME: z.string().default("JurisAI"),
    LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
    /** Number of reverse proxies in front of the app (load balancer = 1), for correct client IPs. */
    TRUST_PROXY_HOPS: z.coerce.number().int().nonnegative().default(0),

    MONGODB_URI: z.string().min(1),

    JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),
    JWT_EXPIRES_IN_SECONDS: z.coerce.number().int().positive().default(60 * 60 * 24 * 30),
    OTP_TTL_SECONDS: z.coerce.number().int().positive().default(300),
    OTP_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
    OTP_RESEND_COOLDOWN_SECONDS: z.coerce.number().int().nonnegative().default(30),
    /** Requests to /auth/* per IP per 15 minutes. */
    AUTH_RATE_LIMIT_PER_IP: z.coerce.number().int().positive().default(100),
    /** console: prints the code to the server log (development only). ses: Amazon SES. */
    EMAIL_PROVIDER: z.enum(["console", "ses"]).default("console"),
    /** Verified SES sender, e.g. "JurisAI <no-reply@jurisai.in>". */
    EMAIL_FROM: z.string().optional(),

    // LLM. "Sonnet for generation, Haiku for lighter tasks".
    /**
     * anthropic: Claude (GENERATION_MODEL / EXTRACTION_MODEL / SUPPORT_CHECK_MODEL).
     * gemini: Google Gemini (GEMINI_MODEL / GEMINI_LIGHT_MODEL). Free tier: test data only.
     * offline: labelled template drafts with no AI calls (dev only).
     */
    LLM_PROVIDER: z.enum(["anthropic", "gemini", "offline"]).default("anthropic"),
    GEMINI_API_KEY: z.string().optional(),
    GEMINI_MODEL: z.string().default("gemini-3.8-flash"),
    GEMINI_LIGHT_MODEL: z.string().default("gemini-3.5-flash-lite"),
    GENERATION_MODEL: z.string().default("claude-sonnet-5"),
    EXTRACTION_MODEL: z.string().default("claude-haiku-4-5"),
    // Only sent to models that accept sampling params (see modelCapabilities.ts).
    GENERATION_TEMPERATURE: z.coerce.number().min(0).max(1).default(0.2),
    GENERATION_EFFORT: z.enum(["low", "medium", "high", "xhigh", "max"]).default("high"),
    GENERATION_MAX_TOKENS: z.coerce.number().int().positive().default(32000),
    CITATION_SCAN_ENABLED: bool.default(true),
    // Independent check that each verified citation's source actually says what the draft claims.
    SUPPORT_CHECK_ENABLED: bool.default(true),
    SUPPORT_CHECK_MODEL: z.string().default("claude-haiku-4-5"),

    // Retrieval
    RETRIEVAL_TOP_K: z.coerce.number().int().min(1).max(20).default(6),
    RETRIEVAL_MIN_SCORE: z.coerce.number().min(-1).max(1).default(0),
    LEGAL_STORE: z.enum(["pgvector", "memory"]).default("pgvector"),
    DATABASE_URL: z.string().optional(),
    EMBEDDING_PROVIDER: z.enum(["voyage", "hash"]).default("voyage"),
    VOYAGE_API_KEY: z.string().optional(),
    EMBEDDING_MODEL: z.string().default("voyage-law-2"),
    EMBEDDING_DIM: z.coerce.number().int().positive().default(1024),

    // Quotas and abuse limits
    FREE_DRAFTS_PER_MONTH: z.coerce.number().int().nonnegative().default(3),
    PRO_DRAFTS_PER_MONTH: z.coerce.number().int().positive().default(200),
    GENERATE_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(5),
    GENERATE_RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().int().positive().default(600),

    // Export
    AWS_REGION: z.string().default("ap-south-1"),
    S3_BUCKET: z.string().optional(),
    S3_SIGNED_URL_TTL_SECONDS: z.coerce.number().int().positive().max(604800).default(900),

    // Razorpay
    RAZORPAY_KEY_ID: z.string().optional(),
    RAZORPAY_KEY_SECRET: z.string().optional(),
    RAZORPAY_WEBHOOK_SECRET: z.string().optional(),
    RAZORPAY_PRO_PLAN_ID: z.string().optional(),
    RAZORPAY_PRO_TOTAL_COUNT: z.coerce.number().int().positive().default(12),
  })
  .superRefine((env, ctx) => {
    if (env.LEGAL_STORE === "pgvector" && !env.DATABASE_URL) {
      ctx.addIssue({ code: "custom", path: ["DATABASE_URL"], message: "required when LEGAL_STORE=pgvector" });
    }
    if (env.EMBEDDING_PROVIDER === "voyage" && !env.VOYAGE_API_KEY) {
      ctx.addIssue({ code: "custom", path: ["VOYAGE_API_KEY"], message: "required when EMBEDDING_PROVIDER=voyage" });
    }
    if (env.LLM_PROVIDER === "gemini" && !env.GEMINI_API_KEY) {
      ctx.addIssue({ code: "custom", path: ["GEMINI_API_KEY"], message: "required when LLM_PROVIDER=gemini" });
    }
    if (env.EMAIL_PROVIDER === "ses" && !env.EMAIL_FROM) {
      ctx.addIssue({ code: "custom", path: ["EMAIL_FROM"], message: "required when EMAIL_PROVIDER=ses" });
    }
    if (env.NODE_ENV === "production") {
      if (env.EMAIL_PROVIDER === "console") {
        ctx.addIssue({ code: "custom", path: ["EMAIL_PROVIDER"], message: "console email provider is not allowed in production" });
      }
      if (env.LLM_PROVIDER === "offline") {
        ctx.addIssue({ code: "custom", path: ["LLM_PROVIDER"], message: "offline template drafting is dev-only" });
      }
      if (env.EMBEDDING_PROVIDER === "hash" || env.LEGAL_STORE === "memory") {
        ctx.addIssue({ code: "custom", path: ["LEGAL_STORE"], message: "hash embeddings / memory store are dev-only" });
      }
    }
  });

export type Config = z.infer<typeof EnvSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    const details = parsed.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid environment configuration:\n${details}`);
  }
  return parsed.data;
}
