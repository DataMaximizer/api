import { z } from "zod";

export const smtpProviderSchema = z.object({
  name: z.string().min(1, "Provider name is required"),
  host: z.string().optional(),
  port: z.number().optional(),
  secure: z.boolean().optional(),
  fromEmail: z
    .string()
    .optional()
    .refine(
      (email) => {
        // Only validate as email if it's not empty
        if (!email || email.length === 0) return true;
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
      },
      { message: "Invalid email format" }
    ),
  fromName: z.string().optional(),
  mail: z.string().optional(),
  password: z.string().optional(),
  userId: z.string().optional(),
  brevoApiKey: z.string().optional(),
});

export type SmtpProviderInput = z.infer<typeof smtpProviderSchema>;
