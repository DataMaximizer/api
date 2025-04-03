import mongoose, { Document, Schema } from "mongoose";

export interface IVerificationToken extends Document {
  userId: Schema.Types.ObjectId;
  token: string;
  type: "account_activation" | "password_reset";
  expiresAt: Date;
  issuedAt: Date;
  isUsed: boolean;
}

const verificationTokenSchema = new Schema<IVerificationToken>({
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  token: { type: String, required: true, unique: true },
  type: {
    type: String,
    required: true,
    enum: ["account_activation", "password_reset"],
  },
  expiresAt: { type: Date, required: true },
  issuedAt: { type: Date, default: Date.now },
  isUsed: { type: Boolean, default: false },
});

// Tokens automatically expire after their expiresAt date
verificationTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const VerificationToken = mongoose.model<IVerificationToken>(
  "VerificationToken",
  verificationTokenSchema
);
