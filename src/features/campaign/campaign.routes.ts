import { Router } from "express";
import { CampaignController } from "@features/campaign/campaign.controller";
import { authenticate } from "@core/middlewares/auth.middleware";
import { validateRequest } from "@core/middlewares/validation.middleware";
import {
  createCampaignSchema,
  updateCampaignSchema,
  generateVariantsSchema,
  generateContentSchema,
  // regenerateVariantSchema,
  updateMetricsSchema,
  sendEmailSchema,
  createNetworkSchema,
  updateNetworkSchema,
} from "@core/utils/validators/validations/campaign.validation";

const router = Router();

// Base: /api/campaigns

// Create new campaign
router.post(
  "/",
  authenticate,
  validateRequest(createCampaignSchema),
  CampaignController.createCampaign
);

// Get all campaigns with filters
router.get("/", authenticate, CampaignController.getCampaigns);

// Get campaign reports grouped by campaignProcessId
router.get("/report", authenticate, CampaignController.getCampaignReport);

// Get campaign analytics grouped by writing style, tone, and framework
router.get("/analytics", authenticate, CampaignController.getCampaignAnalytics);

// Get campaign by ID
router.get("/:id", authenticate, CampaignController.getCampaignById);

// Update campaign
router.put(
  "/:id",
  authenticate,
  validateRequest(updateCampaignSchema),
  CampaignController.updateCampaign
);

// Delete campaign
router.delete("/:id", authenticate, CampaignController.deleteCampaign);

// Generate content variants
router.post(
  "/:id/variants",
  authenticate,
  validateRequest(generateVariantsSchema),
  CampaignController.generateVariants
);

// Update variant metrics
router.put(
  "/:id/variants/:variantId/metrics",
  authenticate,
  validateRequest(updateMetricsSchema),
  CampaignController.updateMetrics
);

// Update campaign status
router.put("/:id/status", authenticate, CampaignController.updateStatus);

router.post(
  "/generate",
  authenticate,
  validateRequest(generateContentSchema),
  CampaignController.generateContent
);

router.post(
  "/sendEmail",
  authenticate,
  validateRequest(sendEmailSchema),
  CampaignController.sendEmail
);

export default router;
