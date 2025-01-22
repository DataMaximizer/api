import mongoose, { Document, Schema, Types } from "mongoose";

export interface IPostback extends Document {
  subscriberId: Types.ObjectId;
  campaignId: Types.ObjectId;
  status: "pending" | "completed" | "failed";
  processedAt?: Date;
  metadata?: {
    ip?: string;
    userAgent?: string;
    referrer?: string;
  };
  errorMessage?: string;
  createdAt: Date;
  updatedAt: Date;
}

const postbackSchema = new Schema(
  {
    subscriberId: {
      type: Schema.Types.ObjectId,
      ref: "Subscriber",
      required: true,
    },
    campaignId: {
      type: Schema.Types.ObjectId,
      ref: "Campaign",
      required: true,
    },
    status: {
      type: String,
      enum: ["pending", "completed", "failed"],
      default: "pending",
    },
    processedAt: {
      type: Date,
    },
    metadata: {
      ip: String,
      userAgent: String,
      referrer: String,
    },
    retryCount: {
      type: Number,
      default: 0,
    },
    errorMessage: String,
  },
  {
    timestamps: true,
  }
);

// Create indexes for common queries
postbackSchema.index({ status: 1 });
postbackSchema.index({ createdAt: 1 });
postbackSchema.index({ processedAt: 1 });

export const Postback = mongoose.model<IPostback>("Postback", postbackSchema);
