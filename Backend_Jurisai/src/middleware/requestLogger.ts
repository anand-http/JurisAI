import type { RequestHandler } from "express";
import type { Logger } from "pino";

/** Access log with no bodies, headers or query strings: request content may contain case facts. */
export function requestLogger(logger: Logger): RequestHandler {
  return (req, res, next) => {
    const started = process.hrtime.bigint();
    res.on("finish", () => {
      logger.info(
        {
          method: req.method,
          path: req.originalUrl.split("?")[0],
          status: res.statusCode,
          ms: Number((process.hrtime.bigint() - started) / 1_000_000n),
          userId: req.auth?.userId,
        },
        "request",
      );
    });
    next();
  };
}
