import { Router, Request, Response, NextFunction } from "express";
import { userController } from "./user.controller";
import { authenticate, authorizeAdmin } from "@core/middlewares/auth.middleware";
import { validateRequest } from "@core/middlewares/validation.middleware";
import { createUserSchema } from "@core/utils/validators/validations/user.validation";

const router = Router();

const asyncHandler = (
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>
) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

router.get("/", 
  authenticate, 
  authorizeAdmin, 
  asyncHandler((req, res, next) => userController.listUsers(req, res))
);

router.get("/:id", 
  authenticate, 
  asyncHandler((req, res, next) => userController.getUserById(req, res))
);

router.put("/:id", 
  authenticate, 
  validateRequest(createUserSchema),
  asyncHandler((req, res, next) => userController.updateUser(req, res))
);

router.delete("/:id", 
  authenticate, 
  authorizeAdmin, 
  asyncHandler((req, res, next) => userController.deleteUser(req, res))
);

export const userRouter = router;
