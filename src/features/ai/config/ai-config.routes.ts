import { Router } from "express";
import { AIConfigController } from "./ai-config.controller";
import { authenticate } from "@core/middlewares/auth.middleware";
import { validateRequest } from "@core/middlewares/validation.middleware";
import { aiConfigSchema } from "@core/utils/validators/validations/ai-config.validation";

const router = Router();

router.get("/settings/ai-config", authenticate, AIConfigController.getConfig);

router.post(
  "/settings/ai-config",
  authenticate,
  validateRequest(aiConfigSchema),
  AIConfigController.updateConfig
);

router.delete(
  "/settings/ai-config",
  authenticate,
  AIConfigController.deleteConfig
);

router.post(
  "/settings/ai-config/validate",
  authenticate,
  AIConfigController.validateApiKey
);

router.post("/agents/offer-selection", authenticate, (req, res) =>
  AIConfigController.runOfferSelection(req, res)
);

router.post("/agents/conversion-analysis", authenticate, (req, res) =>
  AIConfigController.runConversionAnalysis(req, res)
);

router.post("/agents/writing-style-optimization", authenticate, (req, res) =>
  AIConfigController.runWritingStyleOptimization(req, res)
);

router.post("/agents/start-campaign", authenticate, (req, res) =>
  AIConfigController.startCampaign(req, res)
);

router.get("/agents/campaigns", authenticate, (req, res) =>
  AIConfigController.getUserCampaigns(req, res)
);

router.get("/agents/user-events", (req, res) =>
  AIConfigController.subscribeToUserEvents(req, res)
);

export default router;
