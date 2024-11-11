import { z } from "zod";
import { UserSex } from "../models/user.model";

export const updateProfileSchema = z.object({
	name: z.string().min(2).optional(),
	email: z.string().email().optional(),
	phone: z.string().min(10).optional(),
	document: z.string().optional(),
	bornAt: z.string().or(z.date()).optional(),
	sex: z.nativeEnum(UserSex).optional(),
	address: z
		.object({
			line1: z.string(),
			line2: z.string().optional(),
			postalCode: z.string(),
			neighborhood: z.string(),
			state: z.string().length(2),
		})
		.optional(),
	configuration: z
		.object({
			position: z.array(z.string()).optional(),
			shift: z
				.object({
					start: z.string().optional(),
					end: z.string().optional(),
				})
				.optional(),
		})
		.optional(),
});
