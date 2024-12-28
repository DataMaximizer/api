import { Router } from "express";
import { adminController } from "@features/admin/admin.controller";
import { validateRequest } from "@core/middlewares/validation.middleware";
import { loginSchema } from "@core/utils/validators/validations/admin.validation";
import { authenticate, authorizeAdmin, authorizeOwner } from "@core/middlewares/auth.middleware";

const router = Router();

// Login route - accessible to both ADMIN and OWNER
router.post("/login", validateRequest(loginSchema), adminController.login);

// Admin routes - accessible to both ADMIN and OWNER
router.get("/dashboard", authenticate, authorizeAdmin, adminController.getDashboard);

// Owner-only routes
router.get("/system-settings", authenticate, authorizeOwner, adminController.getSystemSettings);

export default router;
