import mongoose, { Document, Schema, Types } from "mongoose";
import {
  CopywritingStyle,
  WritingStyle,
  Tone,
  Personality,
} from "../agents/offer-selection/OfferSelectionAgent";

export interface ICampaignProcess extends Document {
  userId: string;
  name: string;
  status:
    | "pending"
    | "processing"
    | "completed"
    | "failed"
    | "waiting_for_metrics";
  aiProvider: "openai" | "claude";
  smtpProviderId?: string; // SMTP provider ID for sending emails
  senderName?: string; // Name to display as the sender
  senderEmail?: string; // Email address to use as sender
  configuration?: any; // Store the complete configuration
  result?: {
    bestParameters?: {
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
  };
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
    name: {
      type: String,
      default: "Email Optimization Process",
    },
    aiProvider: {
      type: String,
      enum: ["openai", "claude"],
      required: true,
    },
    smtpProviderId: {
      type: Schema.Types.ObjectId,
      ref: "SmtpProvider",
    },
    senderName: {
      type: String,
    },
    senderEmail: {
      type: String,
    },
    configuration: {
      type: Schema.Types.Mixed, // Store any object
    },
    status: {
      type: String,
      enum: ["pending", "processing", "completed", "failed"],
      default: "pending",
    },
    result: {
      bestParameters: {
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
