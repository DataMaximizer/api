import { Router } from "express";
import { adminController } from "@features/admin/admin.controller";
import { validateRequest } from "@core/middlewares/validation.middleware";
import { loginSchema } from "@core/utils/validators/validations/admin.validation";

const router = Router();

router.post("/login", validateRequest(loginSchema), adminController.login);

export default router;
