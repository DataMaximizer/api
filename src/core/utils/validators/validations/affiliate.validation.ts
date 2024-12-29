import { z } from "zod";

export const createOfferSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  description: z.string().min(10, "Description must be at least 10 characters"),
  url: z.string().url("Invalid URL format"),
  categories: z.array(z.string()).min(0),
  tags: z.array(z.string()).optional(),
  commissionRate: z.number().min(0).max(100),
  userCommissionRate: z.number().min(0).max(100).optional(),
});

export const updateOfferSchema = createOfferSchema.partial();
