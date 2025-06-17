import { Router } from "express";
import { AutomationController } from "./automation.controller";
import { authenticate } from "@core/middlewares/auth.middleware";
import { validateRequest } from "@core/middlewares/validation.middleware";
import {
  createAutomationSchema,
  updateAutomationSchema,
} from "@core/utils/validators/validations/automation.validation";

const router = Router();

router.post(
  "/",
  authenticate,
  validateRequest(createAutomationSchema),
  AutomationController.createAutomation
);

router.get("/", authenticate, AutomationController.getAutomations);
router.get("/:id", authenticate, AutomationController.getAutomation);

router.put(
  "/:id",
  authenticate,
  validateRequest(updateAutomationSchema),
  AutomationController.updateAutomation
);

router.delete("/:id", authenticate, AutomationController.deleteAutomation);

export default router;
