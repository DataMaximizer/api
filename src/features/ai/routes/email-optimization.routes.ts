import { Router } from "express";
import { EmailOptimizationController } from "../controllers/email-optimization.controller";
import { authenticate } from "@core/middlewares/auth.middleware";
import { AIConfigController } from "../config/ai-config.controller";

const router = Router();

/**
 * @route POST /api/ai/email-optimization
 * @desc Start a new email optimization process
 * @access Private
 */
router.post(
  "/",
  authenticate,
  EmailOptimizationController.startOptimizationProcess
);

/**
 * @route GET /api/ai/email-optimization/status/:processId
 * @desc Get the status of an email optimization process
 * @access Private
 */
router.get(
  "/status/:processId",
  authenticate,
  EmailOptimizationController.getOptimizationStatus
);

/**
 * @route GET /api/ai/email-optimization/list
 * @desc List all email optimization processes for a user
 * @access Private
 */
router.get(
  "/list",
  authenticate,
  EmailOptimizationController.listOptimizationProcesses
);

/**
 * @route GET /api/ai/email-optimization/details/:processId
 * @desc Get detailed information about an optimization process
 * @access Private
 */
router.get(
  "/details/:processId",
  authenticate,
  EmailOptimizationController.getOptimizationDetails
);

/**
 * @route GET /api/ai/email-optimization/tree/:processId
 * @desc Get hierarchical tree structure of optimization data (process -> rounds -> segments)
 * @access Private
 */
router.get(
  "/tree/:processId",
  authenticate,
  EmailOptimizationController.getOptimizationTree
);

/**
 * @route POST /api/ai/email-optimization/send-winning-email/:processId
 * @desc Send the winning email template to subscribers
 * @access Private
 */
router.post(
  "/send-winning-email/:processId",
  authenticate,
  EmailOptimizationController.sendWinningEmail
);

export default router;
