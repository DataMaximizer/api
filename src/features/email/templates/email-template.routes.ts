import { Router } from "express";
import { authenticate } from "@core/middlewares/auth.middleware";
import { EmailTemplateController } from "./email-template.controller";

const router = Router();

// Get all templates with filtering
router.get("/", authenticate, EmailTemplateController.getAllTemplates);

// Get single template by ID
router.get("/:id", authenticate, EmailTemplateController.getTemplateById);

// Create new template
router.post("/", authenticate, EmailTemplateController.createTemplate);

// Update template
router.put("/:id", authenticate, EmailTemplateController.updateTemplate);

// Delete template
router.delete("/:id", authenticate, EmailTemplateController.deleteTemplate);

export default router;
