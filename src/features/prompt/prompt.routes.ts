import express from "express";
import {
  authenticate,
  authorizeAdmin,
} from "@core/middlewares/auth.middleware";
import { PromptController } from "./prompt.controller";

const router = express.Router();

router.get("/", authenticate, authorizeAdmin, PromptController.getPrompts);
router.post("/", authenticate, authorizeAdmin, PromptController.createPrompt);
router.put("/:id", authenticate, authorizeAdmin, PromptController.updatePrompt);
router.delete(
  "/:id",
  authenticate,
  authorizeAdmin,
  PromptController.deletePrompt
);

router.post("/test", authenticate, authorizeAdmin, PromptController.testPrompt);

export default router;
