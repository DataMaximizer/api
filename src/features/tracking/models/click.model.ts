import mongoose, { Document, Schema, Types } from "mongoose";
import { eventBus, EventType } from "@core/events/event-bus";

export interface IClick extends Document {
  subscriberId: Types.ObjectId;
  campaignId?: Types.ObjectId;
  automationId?: Types.ObjectId;
  nodeId?: string;
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
      required: false,
    },
    automationId: {
      type: Schema.Types.ObjectId,
      ref: "Automation",
    },
    nodeId: {
      type: String,
    },
    linkId: {
      type: String,
      required: false,
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
