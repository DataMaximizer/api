import { z } from "zod";

export const formFieldSchema = z.object({
	id: z.string(),
	label: z.string().min(1, "Label is required"),
	type: z.string(),
	required: z.boolean(),
	minLength: z.number().optional(),
	maxLength: z.number().optional(),
	options: z.array(z.string()).optional(),
});

export const formStyleSchema = z.object({
	type: z.enum(["material", "minimalistic", "concise"]),
	primaryColor: z.string(),
});

export const createFormSchema = z.object({
	title: z.string().min(1, "Form title is required"),
	fields: z.array(formFieldSchema),
	style: formStyleSchema,
	defaultFields: z.object({
		name: z.boolean(),
		email: z.boolean(),
	}),
	status: z.enum(["active", "inactive", "draft"]).default("draft"),
});

export const updateFormSchema = createFormSchema.partial();