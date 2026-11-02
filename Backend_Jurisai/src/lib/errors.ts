import type { ErrorRequestHandler, RequestHandler } from "express";
import type { Logger } from "pino";
import { z } from "zod";

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
  }
}

export const badRequest = (message: string, details?: Record<string, unknown>) =>
  new HttpError(400, "bad_request", message, details);
export const unauthorized = (message = "Authentication required") => new HttpError(401, "unauthorized", message);
export const notFound = (message = "Not found") => new HttpError(404, "not_found", message);

export const notFoundHandler: RequestHandler = (_req, res) => {
  res.status(404).json({ error: { code: "not_found", message: "Route not found" } });
};

export function errorHandler(logger: Logger): ErrorRequestHandler {
  return (err, req, res, _next) => {
    if (err instanceof HttpError) {
      res.status(err.status).json({ error: { code: err.code, message: err.message, ...err.details } });
      return;
    }
    if (err instanceof z.ZodError) {
      res.status(400).json({
        error: {
          code: "validation_error",
          message: "Request validation failed",
          issues: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
        },
      });
      return;
    }
    // Only errors marked safe to expose (express.json() parse failures, payload too large) keep
    // their status and message. Anything else with a `status` (e.g. an upstream SDK error)
    // could leak internals, so it becomes a generic 500.
    const status = err?.expose === true && typeof err.status === "number" ? err.status : 500;
    if (status < 500) {
      res.status(status).json({ error: { code: "bad_request", message: err.message ?? "Bad request" } });
      return;
    }
    // Log the error type and stack only; never the request body.
    logger.error({ err: { name: err?.name, message: err?.message, stack: err?.stack }, path: req.path }, "unhandled error");
    res.status(500).json({ error: { code: "internal_error", message: "Something went wrong" } });
  };
}
