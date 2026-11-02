import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../../middleware/auth.js";
import type { RateLimiters } from "../../middleware/rateLimits.js";
import { loginWithPassword, requestOtp, setPassword, verifyOtp, type AuthDeps } from "./auth.service.js";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "./password.js";

const emailSchema = z
  .string({ error: "Enter a valid email address" })
  .trim()
  .toLowerCase()
  .pipe(z.email("Enter a valid email address").max(320));

const password = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Password must be at least ${PASSWORD_MIN_LENGTH} characters`)
  .max(PASSWORD_MAX_LENGTH, `Password must be at most ${PASSWORD_MAX_LENGTH} characters`);

const OtpRequestBody = z.object({ email: emailSchema });
const VerifyBody = z.object({ email: emailSchema, otp: z.string().regex(/^\d{6}$/, "The code must be 6 digits") });
const LoginBody = z.object({ email: emailSchema, password: z.string().min(1).max(PASSWORD_MAX_LENGTH) });
const SetPasswordBody = z.object({ newPassword: password, currentPassword: z.string().max(PASSWORD_MAX_LENGTH).optional() });

export function authRouter(deps: AuthDeps, limiters: RateLimiters): Router {
  const router = Router();
  router.use(limiters.authIp);

  /** { email } -> sends a 6-digit sign-in code. The account is created on first verify. */
  router.post("/otp", limiters.otpPerEmail, async (req, res) => {
    const { email } = OtpRequestBody.parse(req.body);
    await requestOtp(deps, email);
    res.json({ success: true });
  });

  /** { email, otp } -> { token, user } */
  router.post("/verify", async (req, res) => {
    const { email, otp } = VerifyBody.parse(req.body);
    res.json(await verifyOtp(deps, email, otp));
  });

  /** { email, password } -> { token, user }. Accounts get a password via PUT /auth/password. */
  router.post("/login", limiters.loginPerEmail, async (req, res) => {
    const { email, password: pw } = LoginBody.parse(req.body);
    res.json(await loginWithPassword(deps, email, pw));
  });

  /** Signed in: { newPassword, currentPassword? } -> { user } */
  router.put("/password", requireAuth(deps.config.JWT_SECRET), async (req, res) => {
    const { newPassword, currentPassword } = SetPasswordBody.parse(req.body);
    res.json(await setPassword(req.auth!, newPassword, currentPassword));
  });

  return router;
}
