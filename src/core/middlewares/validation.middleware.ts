import { Request, Response, NextFunction } from "express";
import { AnyZodObject } from "zod";

export const validateRequest = (schema: AnyZodObject) => {
	return async (req: Request, res: Response, next: NextFunction) => {
		try {
			await schema.parseAsync(req.body);
			next();
		} catch (error) {
			res
				.status(400)
				// @ts-ignore
				.json({ error: error.errors?.[0]?.message || "Validation error" });
		}
	};
};
