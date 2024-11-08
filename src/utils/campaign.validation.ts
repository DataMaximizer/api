import { z } from "zod";
import { CampaignType, CampaignStatus } from "../models/campaign.model";
import { ContentFramework, WritingTone } from "../models/ai-content.model";

export const createCampaignSchema = z.object({
	name: z.string().min(1, "Campaign name is required"),
	type: z.enum([CampaignType.EMAIL, CampaignType.SMS]),
	segments: z.array(z.string()),
	schedule: z
		.object({
			startDate: z.string().or(z.date()),
			endDate: z.string().or(z.date()).optional(),
			sendTime: z.string().optional(),
		})
		.optional(),
	settings: z.object({
		fromName: z.string().min(1, "From name is required"),
		fromEmail: z.string().email().optional(),
		fromPhone: z.string().optional(),
		replyTo: z.string().email().optional(),
		customPrompts: z.array(z.string()).optional(),
	}),
	smtpProviderId: z.string().min(1, "SMTP provider is required"),
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
	offerId: z.string({
		required_error: "Offer ID is required",
	}),
	framework: z.string({
		required_error: "Framework is required",
	}),
	tone: z.string({
		required_error: "Tone is required",
	}),
	numberOfVariants: z.number().min(1).max(5).optional().default(3),
});

export const regenerateVariantSchema = z.object({
	offerId: z.string({
		required_error: "Offer ID is required",
	}),
	framework: z.string({
		required_error: "Framework is required",
	}),
	tone: z.string({
		required_error: "Tone is required",
	}),
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
