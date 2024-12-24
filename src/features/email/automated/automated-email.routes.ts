import { Router } from "express";
import { authenticate } from "@core/middlewares/auth.middleware";
import { validateRequest } from "@core/middlewares/validation.middleware";
import { AutomatedEmailService } from "./automated-email.service";
import { z } from "zod";

const router = Router();

const automatedEmailSchema = z.object({
  url: z.string().url("Invalid URL format"),
  commissionRate: z.number().min(0).max(100),
  subscriberListId: z.string().min(1, "Subscriber list ID is required"),
  smtpProviderId: z.string().min(1, "SMTP provider ID is required"),
});

router.post(
  "/analyze-and-send",
  authenticate,
  validateRequest(automatedEmailSchema),
  async (req, res, next) => {
    try {
      const { url, commissionRate, subscriberListId, smtpProviderId } =
        req.body;

      await AutomatedEmailService.processUrlAndGenerateEmail(
        url,
        commissionRate,
        req.user!._id.toString(),
        subscriberListId,
        smtpProviderId,
      );

      res.status(201).json({
        success: true,
        message: "Automated email campaign initiated successfully",
      });
    } catch (error) {
      next(error);
    }
  },
);

export default router;
