import { Router } from "express";
import { CampaignController } from "../controllers/campaign.controller";
import { authenticate } from "../middlewares/auth.middleware";
import { validateRequest } from "../middlewares/validation.middleware";
import {
	createCampaignSchema,
	updateCampaignSchema,
	generateVariantsSchema,
	generateContentSchema,
	// regenerateVariantSchema,
	updateMetricsSchema,
} from "../utils/campaign.validation";

const router = Router();

// Base: /api/campaigns

// Create new campaign
router.post(
	"/",
	authenticate,
	validateRequest(createCampaignSchema),
	CampaignController.createCampaign,
);

// Get all campaigns with filters
router.get("/", authenticate, CampaignController.getCampaigns);

// Get campaign by ID
router.get("/:id", authenticate, CampaignController.getCampaignById);

// Update campaign
router.put(
	"/:id",
	authenticate,
	validateRequest(updateCampaignSchema),
	CampaignController.updateCampaign,
);

// Delete campaign
router.delete("/:id", authenticate, CampaignController.deleteCampaign);

// Generate content variants
router.post(
	"/:id/variants",
	authenticate,
	validateRequest(generateVariantsSchema),
	CampaignController.generateVariants,
);

// Update variant metrics
router.put(
	"/:id/variants/:variantId/metrics",
	authenticate,
	validateRequest(updateMetricsSchema),
	CampaignController.updateMetrics,
);

// Update campaign status
router.put("/:id/status", authenticate, CampaignController.updateStatus);

router.post(
	"/generate",
	authenticate,
	validateRequest(generateContentSchema),
	CampaignController.generateContent,
);

// router.post(
// 	"/regenerate-variant",
// 	authenticate,
// 	validateRequest(regenerateVariantSchema),
// 	CampaignController.regenerateVariant,
// );

export default router;
