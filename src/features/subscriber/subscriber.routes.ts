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
  authenticate,
  upload.single("file"),
  SubscriberController.importSubscribers
);

export default router;
