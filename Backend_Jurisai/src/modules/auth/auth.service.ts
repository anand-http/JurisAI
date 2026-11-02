import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import type { Config } from "../../config/env.js";
import { HttpError } from "../../lib/errors.js";
import { signAccessToken, type AuthMethod } from "../../middleware/auth.js";
import { OtpModel } from "../../models/otp.model.js";
import { UserModel, serializeUser, type User } from "../../models/user.model.js";
import type { EmailProvider } from "./emailProvider.js";
import { burnPasswordCheck, hashPassword, verifyPassword } from "./password.js";

export interface AuthDeps {
  config: Config;
  email: EmailProvider;
}

/** A session created by an email code this recently may set a new password without the old one. */
export const FRESH_OTP_SESSION_SECONDS = 15 * 60;

const invalidOtp = () => new HttpError(400, "otp_invalid", "The code is invalid or has expired");
const invalidCredentials = () => new HttpError(401, "invalid_credentials", "Incorrect email or password");

function hashOtp(secret: string, email: string, code: string): string {
  return createHmac("sha256", secret).update(`${email}:${code}`).digest("hex");
}

function safeEqualHex(a: string, b: string): boolean {
  const ab = Buffer.from(a, "hex");
  const bb = Buffer.from(b, "hex");
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

function session(deps: AuthDeps, user: User, method: AuthMethod) {
  const { config } = deps;
  return {
    token: signAccessToken(user._id.toString(), method, config.JWT_SECRET, config.JWT_EXPIRES_IN_SECONDS),
    user: serializeUser(user),
  };
}

// ---- email code ----------------------------------------------------------------

/** Sends a sign-in code. Works for new and existing emails alike; the account is created on verify. */
export async function requestOtp(deps: AuthDeps, email: string): Promise<void> {
  const { config } = deps;
  const now = Date.now();

  const existing = await OtpModel.findOne({ email }).lean();
  if (existing) {
    const elapsed = (now - existing.sentAt.getTime()) / 1000;
    if (elapsed < config.OTP_RESEND_COOLDOWN_SECONDS) {
      throw new HttpError(429, "otp_cooldown", "Please wait before requesting another code", {
        retryAfterSeconds: Math.ceil(config.OTP_RESEND_COOLDOWN_SECONDS - elapsed),
      });
    }
  }

  const code = randomInt(0, 1_000_000).toString().padStart(6, "0");
  await OtpModel.findOneAndUpdate(
    { email },
    {
      codeHash: hashOtp(config.JWT_SECRET, email, code),
      attempts: 0,
      sentAt: new Date(now),
      expiresAt: new Date(now + config.OTP_TTL_SECONDS * 1000),
    },
    { upsert: true },
  );
  await deps.email.sendOtp(email, code, Math.round(config.OTP_TTL_SECONDS / 60));
}

export async function verifyOtp(deps: AuthDeps, email: string, code: string) {
  const { config } = deps;

  // Count the attempt before comparing, atomically, so parallel guesses can't exceed the cap.
  const otp = await OtpModel.findOneAndUpdate(
    { email, expiresAt: { $gt: new Date() }, attempts: { $lt: config.OTP_MAX_ATTEMPTS } },
    { $inc: { attempts: 1 } },
    { returnDocument: "after" },
  ).lean();

  if (!otp) {
    const exhausted = await OtpModel.exists({ email, attempts: { $gte: config.OTP_MAX_ATTEMPTS } });
    if (exhausted) {
      await OtpModel.deleteOne({ email });
      throw new HttpError(429, "otp_attempts_exceeded", "Too many incorrect attempts. Request a new code");
    }
    throw invalidOtp();
  }

  if (!safeEqualHex(otp.codeHash, hashOtp(config.JWT_SECRET, email, code))) throw invalidOtp();

  // Single use: only the request that actually deletes the code gets a token.
  const { deletedCount } = await OtpModel.deleteOne({ _id: otp._id, codeHash: otp.codeHash });
  if (deletedCount !== 1) throw invalidOtp();

  const user = await UserModel.findOneAndUpdate(
    { email },
    { $set: { lastLoginAt: new Date() }, $setOnInsert: { email, plan: "free" } },
    { upsert: true, returnDocument: "after" },
  ).lean();
  if (!user) throw new Error("user upsert returned null");
  return session(deps, user, "otp");
}

// ---- password --------------------------------------------------------------------

export async function loginWithPassword(deps: AuthDeps, email: string, password: string) {
  const user = await UserModel.findOne({ email }).select("+passwordHash").lean();
  if (!user?.passwordHash) {
    await burnPasswordCheck(password);
    throw invalidCredentials();
  }
  if (!(await verifyPassword(password, user.passwordHash))) throw invalidCredentials();

  await UserModel.updateOne({ _id: user._id }, { $set: { lastLoginAt: new Date() } });
  const { passwordHash: _omit, ...safe } = user;
  return session(deps, safe, "password");
}

/**
 * Sets or changes the password. Changing an existing password needs the current one, unless
 * the user signed in with an email code in the last 15 minutes: that proves they control the
 * mailbox, and is how "forgot password" works (sign in with a code, then set a new one).
 */
export async function setPassword(
  auth: NonNullable<Express.Request["auth"]>,
  newPassword: string,
  currentPassword: string | undefined,
) {
  const user = await UserModel.findById(auth.userId).select("+passwordHash").lean();
  if (!user) throw new HttpError(401, "unauthorized", "Account not found");

  if (user.passwordHash) {
    const freshOtp = auth.method === "otp" && Date.now() / 1000 - auth.issuedAt < FRESH_OTP_SESSION_SECONDS;
    if (!freshOtp) {
      if (!currentPassword) {
        throw new HttpError(400, "current_password_required", "Enter your current password, or sign in again with an email code");
      }
      if (!(await verifyPassword(currentPassword, user.passwordHash))) {
        throw new HttpError(400, "current_password_incorrect", "Your current password is incorrect");
      }
    }
  }
  if (newPassword.toLowerCase() === user.email) {
    throw new HttpError(400, "weak_password", "Choose a password that is not your email address");
  }

  const updated = await UserModel.findByIdAndUpdate(
    user._id,
    { $set: { passwordHash: await hashPassword(newPassword), passwordUpdatedAt: new Date() } },
    { returnDocument: "after" },
  ).lean();
  return { user: serializeUser(updated!) };
}
