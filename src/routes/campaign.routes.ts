import { Router } from "express";
import { CampaignController } from "../controllers/campaign.controller";
import { authenticate } from "../middlewares/auth.middleware";
import { validateRequest } from "../middlewares/validation.middleware";
import {
	createCampaignSchema,
	updateCampaignSchema,
	generateVariantsSchema,
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

export default router;
