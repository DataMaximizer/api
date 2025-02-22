import express from "express";
import { authenticate } from "@core/middlewares/auth.middleware";
import { validateRequest } from "@core/middlewares/validation.middleware";
import { smtpProviderSchema } from "@core/utils/validators/validations/smtp.validation";
import { smtpController } from "./smtp.controller";

const router = express.Router();

router.post(
  "/providers",
  authenticate,
  validateRequest(smtpProviderSchema),
  (req, res) => smtpController.createProvider(req, res)
);

router.get("/providers", authenticate, (req, res) =>
  smtpController.getProviders(req, res)
);

router.get("/providers/:id", authenticate, (req, res) =>
  smtpController.getProvider(req, res)
);

router.delete("/providers/:id", authenticate, (req, res) =>
  smtpController.deleteProvider(req, res)
);

router.put(
  "/providers/:id",
  authenticate,
  validateRequest(smtpProviderSchema),
  (req, res) => smtpController.updateProvider(req, res)
);

router.post("/providers/:id/test", authenticate, (req, res) =>
  smtpController.testConnection(req, res)
);

router.post("/providers/:id/test-email", authenticate, (req, res) =>
  smtpController.sendTestEmail(req, res)
);

router.post("/webhook/bounce", (req, res) =>
  smtpController.handleBounce(req, res)
);

router.get("/brevo/senders", authenticate, (req, res) =>
  smtpController.getBrevoSenders(req, res)
);

export default router;
