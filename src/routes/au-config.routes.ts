import { Router } from "express";
import { AIConfigController } from "../controllers/ai-config.controller";
import { authenticate } from "../middlewares/auth.middleware";
import { validateRequest } from "../middlewares/validation.middleware";
import { aiConfigSchema } from "../utils/ai-config.validation";

const router = Router();

router.get("/settings/ai-config", authenticate, AIConfigController.getConfig);

router.post(
	"/settings/ai-config",
	authenticate,
	validateRequest(aiConfigSchema),
	AIConfigController.updateConfig,
);

router.delete(
	"/settings/ai-config",
	authenticate,
	AIConfigController.deleteConfig,
);

router.post(
	"/settings/ai-config/validate",
	authenticate,
	AIConfigController.validateApiKey,
);

export default router;
