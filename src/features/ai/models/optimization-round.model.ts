import mongoose, { Document, Schema, Types } from "mongoose";
import {
  CopywritingStyle,
  WritingStyle,
  Tone,
  Personality,
} from "../agents/offer-selection/OfferSelectionAgent";

export enum OptimizationStatus {
  PENDING = "pending",
  IN_PROGRESS = "in_progress",
  COMPLETED = "completed",
  FAILED = "failed",
}

export interface IOptimizationRound extends Document {
  userId: Types.ObjectId;
  campaignProcessId: Types.ObjectId;
  roundNumber: number;
  status: OptimizationStatus;
  startDate: Date;
  endDate?: Date;
  subscriberIds: Types.ObjectId[];
  subscriberSegmentIds: Types.ObjectId[];
  offerIds: Types.ObjectId[];
  emailsSent?: Array<{
    subscriberId: Types.ObjectId;
    subject: string;
    body: string;
    generatedPrompt?: string;
    aiProvider?: string;
    aiModel?: string;
    offerId?: Types.ObjectId;
    campaignId?: Types.ObjectId;
    styleParameters?: {
      copywritingStyle: CopywritingStyle;
      writingStyle: WritingStyle;
      tone: Tone;
      personality: Personality;
    };
  }>;
  bestPerformingParameters?: {
    copywritingStyle: CopywritingStyle;
    writingStyle: WritingStyle;
    tone: Tone;
    personality: Personality;
    conversionRate: number;
    clickRate: number;
  };
  bestPerformingEmails?: {
    byConversionRate: Array<{
      offerId: Types.ObjectId;
      offerName: string;
      campaignId: Types.ObjectId;
      subject: string;
      content: string;
      conversionRate: number;
      styleParameters: {
        copywritingStyle: CopywritingStyle;
        writingStyle: WritingStyle;
        tone: Tone;
        personality: Personality;
      };
    }>;
    byClickRate: Array<{
      offerId: Types.ObjectId;
      offerName: string;
      campaignId: Types.ObjectId;
      subject: string;
      content: string;
      clickRate: number;
      styleParameters: {
        copywritingStyle: CopywritingStyle;
        writingStyle: WritingStyle;
        tone: Tone;
        personality: Personality;
      };
    }>;
  };
  modelPerformance?: {
    modelAccuracy: number;
    predictedTopStyle: {
      copywritingStyle: CopywritingStyle;
      writingStyle: WritingStyle;
      tone: Tone;
      personality: Personality;
      predictedConversionRate: number;
    };
    actualTopStyle: {
      copywritingStyle: CopywritingStyle;
      writingStyle: WritingStyle;
      tone: Tone;
      personality: Personality;
      actualConversionRate: number;
    };
    predictionError: number;
  };
  campaignIds: Types.ObjectId[];
  metrics: {
    totalSent: number;
    totalOpens: number;
    totalClicks: number;
    totalConversions: number;
    totalRevenue: number;
  };
  nextRoundScheduledFor?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const optimizationRoundSchema = new Schema<IOptimizationRound>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    campaignProcessId: {
      type: Schema.Types.ObjectId,
      ref: "CampaignProcess",
      required: true,
    },
    roundNumber: { type: Number, required: true },
    status: {
      type: String,
      enum: Object.values(OptimizationStatus),
      default: OptimizationStatus.PENDING,
    },
    startDate: { type: Date, default: Date.now },
    endDate: { type: Date },
    subscriberIds: [{ type: Schema.Types.ObjectId, ref: "Subscriber" }],
    subscriberSegmentIds: [
      { type: Schema.Types.ObjectId, ref: "SubscriberSegment" },
    ],
    offerIds: [{ type: Schema.Types.ObjectId, ref: "AffiliateOffer" }],
    emailsSent: [
      {
        subscriberId: { type: Schema.Types.ObjectId, ref: "Subscriber" },
        subject: { type: String },
        body: { type: String },
        generatedPrompt: { type: String },
        aiProvider: { type: String },
        aiModel: { type: String },
        offerId: { type: Schema.Types.ObjectId, ref: "AffiliateOffer" },
        campaignId: { type: Schema.Types.ObjectId, ref: "Campaign" },
        styleParameters: {
          copywritingStyle: {
            type: String,
            enum: ["AIDA", "PAS", "BAB", "PPP", "FAB", "QUEST"],
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
          },
        },
      },
    ],
    bestPerformingParameters: {
      copywritingStyle: {
        type: String,
        enum: ["AIDA", "PAS", "BAB", "PPP", "FAB", "QUEST"],
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
      },
      conversionRate: Number,
      clickRate: Number,
    },
    bestPerformingEmails: {
      byConversionRate: [
        {
          offerId: { type: Schema.Types.ObjectId, ref: "AffiliateOffer" },
          offerName: { type: String },
          campaignId: { type: Schema.Types.ObjectId, ref: "Campaign" },
          subject: { type: String },
          content: { type: String },
          conversionRate: { type: Number },
          styleParameters: {
            copywritingStyle: {
              type: String,
              enum: ["AIDA", "PAS", "BAB", "PPP", "FAB", "QUEST"],
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
            },
          },
        },
      ],
      byClickRate: [
        {
          offerId: { type: Schema.Types.ObjectId, ref: "AffiliateOffer" },
          offerName: { type: String },
          campaignId: { type: Schema.Types.ObjectId, ref: "Campaign" },
          subject: { type: String },
          content: { type: String },
          clickRate: { type: Number },
          styleParameters: {
            copywritingStyle: {
              type: String,
              enum: ["AIDA", "PAS", "BAB", "PPP", "FAB", "QUEST"],
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
            },
          },
        },
      ],
    },
    modelPerformance: {
      modelAccuracy: Number,
      predictedTopStyle: {
        copywritingStyle: {
          type: String,
          enum: ["AIDA", "PAS", "BAB", "PPP", "FAB", "QUEST"],
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
        },
        predictedConversionRate: Number,
      },
      actualTopStyle: {
        copywritingStyle: {
          type: String,
          enum: ["AIDA", "PAS", "BAB", "PPP", "FAB", "QUEST"],
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
        },
        actualConversionRate: Number,
      },
      predictionError: Number,
    },
    campaignIds: [{ type: Schema.Types.ObjectId, ref: "Campaign" }],
    metrics: {
      totalSent: { type: Number, default: 0 },
      totalOpens: { type: Number, default: 0 },
      totalClicks: { type: Number, default: 0 },
      totalConversions: { type: Number, default: 0 },
      totalRevenue: { type: Number, default: 0 },
    },
    nextRoundScheduledFor: { type: Date },
  },
  { timestamps: true }
);

optimizationRoundSchema.index({ userId: 1, campaignProcessId: 1 });
optimizationRoundSchema.index({ roundNumber: 1 });
optimizationRoundSchema.index({ status: 1 });
optimizationRoundSchema.index({ nextRoundScheduledFor: 1 });

export const OptimizationRound = mongoose.model<IOptimizationRound>(
  "OptimizationRound",
  optimizationRoundSchema
);
