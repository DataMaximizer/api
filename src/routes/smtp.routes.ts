import express from "express";
import { authenticate } from "../middlewares/auth.middleware";
import { validateRequest } from "../middlewares/validation.middleware";
import { smtpProviderSchema } from "../utils/smtp.validation";
import { smtpController } from "../controllers/smtp.controller";

const router = express.Router();

// Create SMTP provider
router.post(
	"/providers",
	authenticate,
	validateRequest(smtpProviderSchema),
	(req, res) => smtpController.createProvider(req, res),
);

// Get all providers
router.get("/providers", authenticate, (req, res) =>
	smtpController.getProviders(req, res),
);

// Get single provider
router.get("/providers/:id", authenticate, (req, res) =>
	smtpController.getProvider(req, res),
);

// Delete provider
router.delete("/providers/:id", authenticate, (req, res) =>
	smtpController.deleteProvider(req, res),
);

router.put(
	"/providers/:id",
	authenticate,
	validateRequest(smtpProviderSchema),
	(req, res) => smtpController.updateProvider(req, res),
);

export default router;
