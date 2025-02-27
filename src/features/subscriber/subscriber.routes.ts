import { Router } from "express";
import { SubscriberController } from "./subscriber.controller";
import { authenticate } from "@core/middlewares/auth.middleware";
import { validateRequest } from "@core/middlewares/validation.middleware";
import {
  createSubscriberSchema,
  createListSchema,
  updateListSchema,
} from "@core/utils/validators/validations/subscriber.validation";

import multer from "multer";
import rateLimit from "express-rate-limit";

const router = Router();

// Subscribers
router.post(
  "/",
  validateRequest(createSubscriberSchema),
  SubscriberController.addPublicSubscriber
);

router.get("/", authenticate, SubscriberController.getSubscribers);

// Lists
router.post(
  "/lists",
  authenticate,
  validateRequest(createListSchema),
  SubscriberController.createList
);

router.put(
  "/lists/:listId",
  authenticate,
  validateRequest(updateListSchema),
  SubscriberController.updateList
);

router.delete("/lists/:listId", authenticate, SubscriberController.deleteList);

router.get("/lists", authenticate, SubscriberController.getLists);

router.get(
  "/lists/:listId",
  authenticate,
  SubscriberController.getSubscribersByList
);

// Export
router.get("/export", authenticate, SubscriberController.exportSubscribers);

const upload = multer({ storage: multer.memoryStorage() });

router.post(
  "/import",
  upload.single("file"),
  SubscriberController.importSubscribers
);

router.post("/blocked-emails", authenticate, SubscriberController.blockEmail);

router.get(
  "/blocked-emails",
  authenticate,
  SubscriberController.getBlockedEmails
);

router.delete(
  "/blocked-emails/:id",
  authenticate,
  SubscriberController.unblockEmail
);

router.get("/unsubscribe", SubscriberController.unsubscribe);

// Webhook
const limiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 5, // Max 5 requests per IP
});
router.post("/webhook/add", limiter, SubscriberController.addWebhookSubscriber);

export default router;
