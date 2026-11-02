import { Schema, model, type HydratedDocument, type Types } from "mongoose";

export type Plan = "free" | "pro";

export interface User {
  _id: Types.ObjectId;
  /** Lower-cased. Verified by the email OTP that created the account. */
  email: string;
  name?: string;
  /** scrypt hash (see modules/auth/password.ts); absent until the user sets a password. */
  passwordHash?: string;
  passwordUpdatedAt?: Date;
  /** Denormalised from the active Subscription; only the Razorpay webhook changes it. */
  plan: Plan;
  planRenewsAt?: Date;
  lastLoginAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<User>(
  {
    email: { type: String, required: true, unique: true, trim: true, lowercase: true, maxlength: 320 },
    name: { type: String, trim: true, maxlength: 200 },
    // Never returned by queries unless explicitly selected with "+passwordHash".
    passwordHash: { type: String, select: false },
    passwordUpdatedAt: Date,
    plan: { type: String, enum: ["free", "pro"], default: "free", required: true },
    planRenewsAt: Date,
    lastLoginAt: Date,
  },
  { timestamps: true },
);

export const UserModel = model<User>("User", userSchema);
export type UserDoc = HydratedDocument<User>;

export function serializeUser(user: User) {
  return {
    id: user._id.toString(),
    email: user.email,
    name: user.name ?? null,
    hasPassword: Boolean(user.passwordUpdatedAt),
    plan: user.plan,
    planRenewsAt: user.planRenewsAt ?? null,
    createdAt: user.createdAt,
  };
}
