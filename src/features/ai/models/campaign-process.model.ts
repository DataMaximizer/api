import mongoose, { Document, Schema } from "mongoose";

export interface ICampaignProcess extends Document {
  userId: string;
  status: "pending" | "processing" | "completed" | "failed";
  result?: any;
  error?: string;
  notified?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const campaignProcessSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
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
    notified: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

export const CampaignProcess = mongoose.model<ICampaignProcess>(
  "CampaignProcess",
  campaignProcessSchema
);
