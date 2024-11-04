import { Router } from "express";
import { adminController } from "../controllers/admin.controller";
import { validateRequest } from "../middlewares/validation.middleware";
import { loginSchema } from "../utils/admin.validation";

const router = Router();

router.post("/login", validateRequest(loginSchema), adminController.login);

export default router;
