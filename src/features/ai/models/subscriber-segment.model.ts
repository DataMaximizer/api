import mongoose, { Document, Schema, Types } from "mongoose";
import {
  CopywritingStyle,
  WritingStyle,
  Tone,
  Personality,
} from "../agents/offer-selection/OfferSelectionAgent";

export enum SegmentStatus {
  PENDING = "pending",
  PROCESSED = "processed",
  SKIPPED = "skipped",
}

export interface ISubscriberSegment extends Document {
  userId: Types.ObjectId;
  campaignProcessId: Types.ObjectId;
  optimizationRoundId: Types.ObjectId;
  segmentNumber: number;
  subscriberIds: Types.ObjectId[];
  status: SegmentStatus;
  assignedParameters: {
    copywritingStyle: CopywritingStyle;
    writingStyle: WritingStyle;
    tone: Tone;
    personality: Personality;
  };
  metrics?: {
    totalSent: number;
    totalOpens: number;
    totalClicks: number;
    totalConversions: number;
    totalRevenue: number;
    clickRate: number;
    conversionRate: number;
  };
  campaignIds: Types.ObjectId[];
  isControlGroup: boolean;
  isExplorationGroup: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const subscriberSegmentSchema = new Schema<ISubscriberSegment>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    campaignProcessId: {
      type: Schema.Types.ObjectId,
      ref: "CampaignProcess",
      required: true,
    },
    optimizationRoundId: {
      type: Schema.Types.ObjectId,
      ref: "OptimizationRound",
      required: true,
    },
    segmentNumber: { type: Number, required: true },
    subscriberIds: [
      { type: Schema.Types.ObjectId, ref: "Subscriber", required: true },
    ],
    status: {
      type: String,
      enum: Object.values(SegmentStatus),
      default: SegmentStatus.PENDING,
    },
    assignedParameters: {
      copywritingStyle: {
        type: String,
        enum: ["AIDA", "PAS", "BAB", "PPP", "FAB", "QUEST"],
        required: true,
      },
      writingStyle: {
        type: String,
        enum: [
          "descriptive",
          "narrative",
          "persuasive",
          "expository",
          "conversational",
          "direct",
        ],
        required: true,
      },
      tone: {
        type: String,
        enum: [
          "professional",
          "friendly",
          "enthusiastic",
          "urgent",
          "empathetic",
          "authoritative",
          "casual",
        ],
        required: true,
      },
      personality: {
        type: String,
        enum: [
          "confident",
          "humorous",
          "analytical",
          "caring",
          "adventurous",
          "innovative",
          "trustworthy",
        ],
        required: true,
      },
    },
    metrics: {
      totalSent: { type: Number, default: 0 },
      totalOpens: { type: Number, default: 0 },
      totalClicks: { type: Number, default: 0 },
      totalConversions: { type: Number, default: 0 },
      totalRevenue: { type: Number, default: 0 },
      clickRate: { type: Number, default: 0 },
      conversionRate: { type: Number, default: 0 },
    },
    campaignIds: [{ type: Schema.Types.ObjectId, ref: "Campaign" }],
    isControlGroup: { type: Boolean, default: false },
    isExplorationGroup: { type: Boolean, default: false },
  },
  { timestamps: true }
);

subscriberSegmentSchema.index({ userId: 1, campaignProcessId: 1 });
subscriberSegmentSchema.index({ optimizationRoundId: 1 });
subscriberSegmentSchema.index({ status: 1 });
subscriberSegmentSchema.index({ isControlGroup: 1 });
subscriberSegmentSchema.index({ isExplorationGroup: 1 });

export const SubscriberSegment = mongoose.model<ISubscriberSegment>(
  "SubscriberSegment",
  subscriberSegmentSchema
);
