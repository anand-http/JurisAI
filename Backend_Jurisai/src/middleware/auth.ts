import type { RequestHandler } from "express";
import jwt from "jsonwebtoken";
import { unauthorized } from "../lib/errors.js";

/** How the session was created. An email-code session proves control of the mailbox. */
export type AuthMethod = "otp" | "password";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: { userId: string; method: AuthMethod; issuedAt: number };
    }
  }
}

export function signAccessToken(userId: string, method: AuthMethod, secret: string, expiresInSeconds: number): string {
  return jwt.sign({ amr: method }, secret, { subject: userId, expiresIn: expiresInSeconds, algorithm: "HS256" });
}

export function requireAuth(secret: string): RequestHandler {
  return (req, _res, next) => {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) throw unauthorized();
    try {
      const payload = jwt.verify(header.slice(7), secret, { algorithms: ["HS256"] });
      if (typeof payload === "string" || !payload.sub || !payload.iat) throw unauthorized("Invalid token");
      req.auth = {
        userId: payload.sub,
        method: payload.amr === "otp" ? "otp" : "password",
        issuedAt: payload.iat,
      };
      next();
    } catch {
      throw unauthorized("Invalid or expired token");
    }
  };
}

/** For handlers mounted behind requireAuth. */
export function authUserId(req: Express.Request): string {
  if (!req.auth) throw unauthorized();
  return req.auth.userId;
}
