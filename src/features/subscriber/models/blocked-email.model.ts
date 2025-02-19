import mongoose, { Document, Schema } from "mongoose";

export interface IBlockedEmail extends Document {
  email: string;
  userId: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const blockedEmailSchema = new Schema<IBlockedEmail>(
  {
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true }
);

blockedEmailSchema.index({ userId: 1, email: 1 }, { unique: true });

export const BlockedEmail = mongoose.model<IBlockedEmail>(
  "BlockedEmail",
  blockedEmailSchema
);
