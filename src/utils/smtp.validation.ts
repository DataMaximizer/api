import { z } from "zod";

export const smtpProviderSchema = z.object({
	name: z.string().min(1, "Provider name is required"),
	apiKey: z.string().min(1, "API key is required"),
	host: z.string().min(1, "Host is required"),
	port: z.number().min(1, "Port is required"),
	secure: z.boolean().default(true),
	fromEmail: z.string().email("Invalid email format"),
	fromName: z.string().min(1, "From name is required"),
});

export type SmtpProviderInput = z.infer<typeof smtpProviderSchema>;
