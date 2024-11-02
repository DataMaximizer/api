import { z } from "zod";

export const createUserSchema = z.object({
	type: z.enum(["owner", "customer", "employee"]),
	name: z.string().min(2),
	email: z.string().email(),
	phone: z.string().min(10),
	document: z.string(),
	bornAt: z.string().or(z.date()),
	address: z.object({
		line1: z.string(),
		line2: z.string().optional(),
		line3: z.string().optional(),
		postalCode: z.string(),
		neighborhood: z.string(),
		state: z.string().length(2),
	}),
	sex: z.number().refine((val) => val === 1 || val === 2, {
		message: "Sex must be either 1 (MALE) or 2 (FEMALE)",
	}),
	avatar: z.string().optional(),
	configuration: z
		.object({
			position: z.array(z.string()).optional(),
			shift: z
				.object({
					start: z.string(),
					end: z.string(),
				})
				.optional(),
			lunch: z
				.object({
					start: z.string(),
					end: z.string(),
				})
				.optional(),
			services: z.array(z.string()).optional(),
		})
		.optional(),
	password: z.string().min(8),
});
