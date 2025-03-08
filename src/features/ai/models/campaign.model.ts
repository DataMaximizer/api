import mongoose, { Document, Schema } from "mongoose";

export interface ICampaign extends Document {
  campaignId: string;
  userId: string;
  campaignProcessId?: string; // Reference to campaign process
  status: "pending" | "processing" | "completed" | "failed";
  result?: any;
  error?: string;
  createdAt: Date;
  updatedAt: Date;
}

const campaignSchema = new Schema(
  {
    campaignId: {
      type: String,
      required: true,
      unique: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    campaignProcessId: {
      type: Schema.Types.ObjectId,
      ref: "CampaignProcess",
    },
    status: {
      type: String,
      enum: ["pending", "processing", "completed", "failed"],
      default: "pending",
    },
    result: {
      type: Schema.Types.Mixed,
    },
    error: {
      type: String,
    },
  },
  { timestamps: true }
);

// Add TTL index to automatically delete documents after 24 hours
campaignSchema.index({ createdAt: 1 }, { expireAfterSeconds: 86400 });

export const Campaign = mongoose.model<ICampaign>("Campaign", campaignSchema);
