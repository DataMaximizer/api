import mongoose, { Document, Schema } from "mongoose";

export enum CampaignType {
  EMAIL = "email",
  SMS = "sms",
}

export enum CampaignStatus {
  DRAFT = "draft",
  SCHEDULED = "scheduled",
  RUNNING = "running",
  COMPLETED = "completed",
  PAUSED = "paused",
}

export interface ICampaignVariant extends Document {
  subject?: string;
  content: string;
  tone: string;
  personality: string;
  writingStyle: string;
  metrics: {
    sent: number;
    opens: number;
    clicks: number;
    conversions: number;
    revenue: number;
  };
}

export interface ICampaign extends Document {
  name: string;
  type: CampaignType;
  status: CampaignStatus;
  userId: Schema.Types.ObjectId;
  offerId: Schema.Types.ObjectId;
  campaignProcessId?: Schema.Types.ObjectId;
  subject: string;
  content: string;
  framework?: string;
  tone?: string;
  writingStyle: string;
  smtpProviderId?: Schema.Types.ObjectId;
  schedule?: {
    startDate: Date;
    endDate?: Date;
    sendTime?: string;
    timezone: string;
  };
  metrics?: {
    totalSent: number;
    totalOpens: number;
    totalClicks: number;
    totalConversions: number;
    totalRevenue: number;
  };
  createdAt: Date;
  updatedAt: Date;
}

const campaignVariantSchema = new Schema<ICampaignVariant>({
  subject: String,
  content: { type: String, required: true },
  tone: { type: String, required: true },
  personality: { type: String, required: true },
  writingStyle: { type: String, required: true },
  metrics: {
    opens: { type: Number, default: 0 },
    clicks: { type: Number, default: 0 },
    conversions: { type: Number, default: 0 },
    revenue: { type: Number, default: 0 },
  },
});

const campaignSchema = new Schema<ICampaign>(
  {
    name: { type: String, required: true },
    type: {
      type: String,
      enum: Object.values(CampaignType),
      required: true,
    },
    status: {
      type: String,
      enum: Object.values(CampaignStatus),
      default: CampaignStatus.DRAFT,
    },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    offerId: {
      type: Schema.Types.ObjectId,
      ref: "AffiliateOffer",
      required: true,
    },
    campaignProcessId: {
      type: Schema.Types.ObjectId,
      ref: "CampaignProcess",
    },
    subject: { type: String, required: true },
    content: { type: String, required: true },
    framework: { type: String },
    tone: { type: String },
    writingStyle: { type: String },
    smtpProviderId: { type: Schema.Types.ObjectId, ref: "SmtpProvider" },
    schedule: {
      startDate: { type: Date },
      endDate: { type: Date },
      sendTime: { type: String },
      timezone: { type: String, default: "UTC" },
    },
    metrics: {
      totalSent: { type: Number, default: 0 },
      totalOpens: { type: Number, default: 0 },
      totalClicks: { type: Number, default: 0 },
      totalConversions: { type: Number, default: 0 },
      totalRevenue: { type: Number, default: 0 },
    },
  },
  { timestamps: true }
);

export const Campaign = mongoose.model<ICampaign>("Campaign", campaignSchema);
