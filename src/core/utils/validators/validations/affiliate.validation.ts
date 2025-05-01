import { z } from "zod";

export const createOfferSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  description: z.string().min(5, "Description must be at least 5 characters"),
  url: z.string().url("Invalid URL format"),
  tags: z.array(z.string()).optional(),
  commissionRate: z.number().min(0).max(100),
  userCommissionRate: z.number().min(0).max(100).optional(),
  networkId: z.string(),
});

export const updateOfferSchema = createOfferSchema.partial();
