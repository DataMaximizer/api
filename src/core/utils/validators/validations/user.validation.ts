import { z } from "zod";

export const createUserSchema = z.object({
  type: z.enum(["owner", "customer", "employee"]).optional(),
  name: z.string().min(2),
  email: z.string().email(),
  phone: z.string(),
  document: z.string().optional(),
  bornAt: z.string().or(z.date()).optional(),
  address: z.object({
    line1: z.string(),
    line2: z.string().optional(),
    line3: z.string().optional(),
    postalCode: z.string(),
    neighborhood: z.string().optional(),
    state: z.string(),
    city: z.string(),
    country: z.string(),
  }),
  sex: z
    .number()
    .refine((val) => val === 1 || val === 2, {
      message: "Sex must be either 1 (MALE) or 2 (FEMALE)",
    })
    .optional(),
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
  password: z.string(),
});

export const webhookSchema = z.object({
  type: z.string().min(1, "Webhook type is required"),
  url: z.string().url("A valid URL is required"),
  parameters: z.record(z.string(), z.any()).optional().default({}),
});
