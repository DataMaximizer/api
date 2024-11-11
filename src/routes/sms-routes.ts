import { Router } from "express";
import { SmsController } from "../controllers/sms.controller";
import { authenticate } from "../middlewares/auth.middleware";
import { validateRequest } from "../middlewares/validation.middleware";
import { z } from "zod";

const router = Router();

const smsProviderSchema = z.object({
	name: z.string().min(1, "Provider name is required"),
	type: z.enum(["twilio", "messagebird"]),
	apiKey: z.string().min(1, "API key is required"),
	apiSecret: z.string().min(1, "API secret is required"),
	senderId: z.string().min(1, "Sender ID is required"),
});

const smsTemplateSchema = z.object({
	name: z.string().min(1, "Template name is required"),
	content: z.string().min(1, "Content is required"),
	type: z.enum(["promotional", "transactional"]),
	variables: z.array(z.string()).optional(),
	maxLength: z.number().optional(),
});

const smsCampaignSchema = z.object({
	name: z.string().min(1, "Campaign name is required"),
	template: z.string().min(1, "Template ID is required"),
	provider: z.string().min(1, "Provider ID is required"),
	segments: z.array(z.string()).min(1, "At least one segment is required"),
	schedule: z.object({
		startDate: z.string().or(z.date()),
		endDate: z.string().or(z.date()).optional(),
		sendTime: z.string().optional(),
	}),
});

// Provider routes
router.post(
	"/providers",
	authenticate,
	validateRequest(smsProviderSchema),
	SmsController.createProvider,
);

router.get("/providers", authenticate, SmsController.getProviders);

// Template routes
router.post(
	"/templates",
	authenticate,
	validateRequest(smsTemplateSchema),
	SmsController.createTemplate,
);

router.get("/templates", authenticate, SmsController.getTemplates);

// Campaign routes
router.post(
	"/campaigns",
	authenticate,
	validateRequest(smsCampaignSchema),
	SmsController.createCampaign,
);

router.get("/campaigns", authenticate, SmsController.getCampaigns);

router.post(
	"/campaigns/:id/execute",
	authenticate,
	SmsController.executeCampaign,
);

// Testing route
router.post(
	"/test",
	authenticate,
	validateRequest(
		z.object({
			providerId: z.string().min(1, "Provider ID is required"),
			to: z.string().min(1, "Recipient number is required"),
			content: z.string().min(1, "Message content is required"),
		}),
	),
	SmsController.sendTestSMS,
);

export default router;
