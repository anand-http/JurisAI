import express, { type Express } from "express";
import helmet from "helmet";
import type { Logger } from "pino";
import type { Config } from "./config/env.js";
import { errorHandler, notFoundHandler } from "./lib/errors.js";
import { requireAuth } from "./middleware/auth.js";
import { createRateLimiters } from "./middleware/rateLimits.js";
import { requestLogger } from "./middleware/requestLogger.js";
import { authRouter } from "./modules/auth/auth.routes.js";
import type { EmailProvider } from "./modules/auth/emailProvider.js";
import { razorpayWebhookRouter, subscriptionsRouter } from "./modules/billing/billing.routes.js";
import type { RazorpayGateway } from "./modules/billing/razorpay.js";
import { draftsRouter } from "./modules/drafts/drafts.routes.js";
import type { LlmGateway } from "./modules/drafts/pipeline/4-llmGateway.js";
import { LocalFileStorage, type FileStorage } from "./modules/export/fileStorage.js";
import type { Embedder } from "./modules/legal/embeddings.js";
import type { LegalStore } from "./modules/legal/legalStore.js";

export interface AppDeps {
  config: Config;
  logger: Logger;
  store: LegalStore;
  embedder: Embedder;
  llm: LlmGateway;
  storage: FileStorage;
  email: EmailProvider;
  razorpay: RazorpayGateway | null;
}

export function createApp(deps: AppDeps): Express {
  const { config, logger } = deps;
  const app = express();
  app.set("trust proxy", config.TRUST_PROXY_HOPS);
  app.disable("x-powered-by");
  app.use(helmet());
  app.use(requestLogger(logger));

  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  // Raw body required for signature verification, so this is mounted before express.json().
  app.use("/webhooks/razorpay", razorpayWebhookRouter(deps));

  app.use(express.json({ limit: "1mb" }));

  const limiters = createRateLimiters(config);
  const auth = requireAuth(config.JWT_SECRET);

  app.use("/auth", authRouter(deps, limiters));
  app.use("/drafts", auth, draftsRouter(deps, limiters));
  app.use("/subscriptions", auth, subscriptionsRouter(deps));
  if (deps.storage instanceof LocalFileStorage) app.use("/dev-files", deps.storage.router(auth));

  app.use(notFoundHandler);
  app.use(errorHandler(logger));
  return app;
}
