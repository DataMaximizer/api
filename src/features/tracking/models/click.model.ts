import mongoose, { Document, Schema, Types } from "mongoose";

export interface IClick extends Document {
  subscriberId: Types.ObjectId;
  campaignId: Types.ObjectId;
  linkId: string;
  timestamp: Date;
  metadata?: {
    ip?: string;
    userAgent?: string;
    referrer?: string;
  };
  createdAt: Date;
  updatedAt: Date;
}

const clickSchema = new Schema(
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
    linkId: {
      type: String,
      required: true,
    },
    timestamp: {
      type: Date,
      default: Date.now,
    },
    metadata: {
      ip: String,
      userAgent: String,
      referrer: String,
    },
  },
  {
    timestamps: true,
  }
);

// Create indexes for common queries
clickSchema.index({ subscriberId: 1, campaignId: 1, timestamp: -1 });
clickSchema.index({ timestamp: -1 });
clickSchema.index({ linkId: 1 });

export const Click = mongoose.model<IClick>("Click", clickSchema);
