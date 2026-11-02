import { Schema, model, type Types } from "mongoose";

/** One pending sign-in code per email. The code itself is never stored, only an HMAC of it. */
export interface Otp {
  _id: Types.ObjectId;
  email: string;
  codeHash: string;
  attempts: number;
  expiresAt: Date;
  sentAt: Date;
}

const otpSchema = new Schema<Otp>({
  email: { type: String, required: true, unique: true },
  codeHash: { type: String, required: true },
  attempts: { type: Number, default: 0 },
  expiresAt: { type: Date, required: true },
  sentAt: { type: Date, required: true },
});

// MongoDB TTL monitor removes expired OTPs (runs roughly once a minute; expiry is also checked in code).
otpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const OtpModel = model<Otp>("Otp", otpSchema);
