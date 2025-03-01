import { z } from "zod";

export const smtpProviderSchema = z.object({
  name: z.string().min(1, "Provider name is required"),
  host: z.string().optional(),
  port: z.number().optional(),
  secure: z.boolean().optional(),
  fromEmail: z.string().email("Invalid email format").optional(),
  fromName: z.string().optional(),
  mail: z.string().optional(),
  password: z.string().optional(),
  userId: z.string().optional(),
  brevoApiKey: z.string().optional(),
});

export type SmtpProviderInput = z.infer<typeof smtpProviderSchema>;
