import { Router } from "express";
import { SubscriberController } from "../controllers/subscriber.controller";
import { authenticate } from "../middlewares/auth.middleware";
import { validateRequest } from "../middlewares/validation.middleware";
import {
	createSubscriberSchema,
	createListSchema,
	updateListSchema,
} from "../utils/subscriber.validation";

import multer from "multer";

const router = Router();

// Subscribers
router.post(
	"/",
	authenticate,
	validateRequest(createSubscriberSchema),
	SubscriberController.addSubscriber,
);

router.get("/", authenticate, SubscriberController.getSubscribers);

// Lists
router.post(
	"/lists",
	authenticate,
	validateRequest(createListSchema),
	SubscriberController.createList,
);

router.get("/lists", authenticate, SubscriberController.getLists);

// Export
router.get("/export", authenticate, SubscriberController.exportSubscribers);

const upload = multer({ storage: multer.memoryStorage() });

router.post(
	"/import",
	authenticate,
	upload.single("file"),
	SubscriberController.importSubscribers,
);

export default router;
