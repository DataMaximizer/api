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
  parameters: z
    .array(
      z.object({
        type: z.string(),
        name: z.string(),
        placeholder: z.string(),
      })
    )
    .optional(),
});

router.post(
  "/analyze-and-send",
  authenticate,
  validateRequest(automatedEmailSchema),
  async (req, res, next) => {
    try {
      const {
        url,
        commissionRate,
        subscriberListId,
        smtpProviderId,
        parameters,
      } = req.body;

      // Set headers for SSE
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      // Helper function to send progress updates
      const sendProgress = (step: string, message: string) => {
        res.write(`data: ${JSON.stringify({ step, message })}\n\n`);
      };

      await AutomatedEmailService.processUrlAndGenerateEmail(
        url,
        commissionRate,
        req.user!._id as string,
        subscriberListId,
        smtpProviderId,
        res,
        parameters
      );

      // End the stream
      res.write(
        `data: ${JSON.stringify({
          step: "complete",
          message: "Process completed successfully",
        })}\n\n`
      );
      res.end();
    } catch (error) {
      // Send error through SSE if connection is still open
      if (!res.writableEnded) {
        res.write(
          `data: ${JSON.stringify({
            step: "error",
            message: (error as Error)?.message || "Unknown error occurred",
          })}\n\n`
        );
        res.end();
      }
      next(error);
    }
  }
);

router.get("/history", authenticate, async (req, res, next) => {
  try {
    const campaigns = await AutomatedEmailService.getHistory(req.user!._id as string);
    res.json({
      data: {
        campaigns
      }
    });
  } catch (error) {
    next(error);
  }
});

export default router;
