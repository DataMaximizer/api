import { Router } from "express";
import { authenticate } from "@core/middlewares/auth.middleware";
import { ContentTemplateController } from "./content-template.controller";

const router = Router();

router.get("/", authenticate, ContentTemplateController.getAllTemplates);

export default router; 