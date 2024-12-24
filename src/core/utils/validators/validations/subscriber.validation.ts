import { z } from "zod";

export const createSubscriberSchema = z.object({
	formId: z.string().min(1, "Form ID is required"),
	data: z.record(z.any()),
	email: z.string().email("Invalid email format"),
	tags: z.array(z.string()).optional(),
	lists: z.array(z.string()).optional(),
	metadata: z
		.object({
			ip: z.string().optional(),
			userAgent: z.string().optional(),
			source: z.string().optional(),
		})
		.optional(),
});

export const createListSchema = z.object({
	name: z.string().min(1, "List name is required"),
	description: z.string().optional(),
	tags: z.array(z.string()).optional(),
});

export const updateListSchema = createListSchema.partial();
