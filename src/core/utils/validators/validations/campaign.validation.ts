import { z } from "zod";
import { CampaignStatus } from "@features/campaign/models/campaign.model";

export const createCampaignSchema = z.object({
  offerId: z.string().optional(),
  content: z.string().min(1, "Content is required"),
  subject: z.string().min(1, "Subject is required"),
  framework: z.string().optional(),
  tone: z.string().optional(),
  type: z.enum(["email", "sms"]).default("email"),
  status: z
    .enum(["draft", "scheduled", "running", "completed", "paused"])
    .default("draft"),
});

export const updateCampaignSchema = createCampaignSchema.partial().extend({
  status: z
    .enum([
      CampaignStatus.DRAFT,
      CampaignStatus.SCHEDULED,
      CampaignStatus.RUNNING,
      CampaignStatus.COMPLETED,
      CampaignStatus.PAUSED,
    ])
    .optional(),
});

export const generateContentSchema = z.object({
  offerId: z.string().min(1, "Offer ID is required"),
  framework: z.string().optional(),
  tone: z.string().min(1, "Tone is required"),
  numberOfVariants: z.number().min(1).max(5).optional(),
  style: z.string().optional(),
  prompt: z.string().optional(),
});

export const generateCustomContentSchema = z.object({
  offerId: z.string().min(1, "Offer ID is required"),
  prompt: z.string().min(1, "Custom prompt is required"),
  tone: z.string().min(1, "Tone is required"),
  style: z.string().min(1, "Writing style is required"),
});

export const generateVariantsSchema = z.object({
  productInfo: z.object({}).passthrough(),
  numberOfVariants: z.number().min(1).max(5).optional(),
});

export const updateMetricsSchema = z.object({
  opens: z.number().optional(),
  clicks: z.number().optional(),
  conversions: z.number().optional(),
  revenue: z.number().optional(),
});

export const sendEmailSchema = z.object({
  offerId: z.string().min(1, "Offer ID is required"),
  subscriberId: z.string().min(1, "Subscriber ID is required"),
  campaignId: z.string().min(1, "Campaign ID is required"),
  smtpProviderId: z.string().min(1, "SMTP Provider ID is required"),
  emailContent: z.string().min(1, "Email content is required"),
  subject: z.string().min(1, "Subject is required"),
});

export const createNetworkSchema = z.object({
  name: z.string().min(1, "Network name is required"),
});

export const updateNetworkSchema = createNetworkSchema.partial();
