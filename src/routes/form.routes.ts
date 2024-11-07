import { Router, Request, Response, NextFunction } from "express";
import { FormController } from "../controllers/form.controller";
import { authenticate } from "../middlewares/auth.middleware";
import { validateRequest } from "../middlewares/validation.middleware";
import { createFormSchema, updateFormSchema } from "../utils/form.validation";
import { IUser } from "../models/user.model";

interface AuthRequest extends Request {
	user?: IUser;
}

const router = Router();

const handleController = (
	fn: (req: AuthRequest, res: Response) => Promise<void>,
) => {
	return async (req: Request, res: Response, next: NextFunction) => {
		try {
			await fn(req as AuthRequest, res);
		} catch (error) {
			next(error);
		}
	};
};

router.post(
	"/",
	authenticate,
	validateRequest(createFormSchema),
	handleController(FormController.createForm),
);

router.get("/", authenticate, handleController(FormController.getForms));

router.get("/:id", authenticate, handleController(FormController.getFormById));

router.put(
	"/:id",
	authenticate,
	validateRequest(updateFormSchema),
	handleController(FormController.updateForm),
);

router.delete(
	"/:id",
	authenticate,
	handleController(FormController.deleteForm),
);

export default router;
