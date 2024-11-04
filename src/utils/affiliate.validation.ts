import { z } from "zod";

export const productCategorySchema = z.object({
	name: z.string().min(2, "Category name must be at least 2 characters"),
	description: z.string().min(10, "Description must be at least 10 characters"),
	parentCategory: z.string().optional(),
	isActive: z.boolean().optional(),
});

export const affiliateOfferSchema = z.object({
	title: z.string().min(5, "Title must be at least 5 characters"),
	description: z.string().min(20, "Description must be at least 20 characters"),
	productUrl: z.string().url("Invalid product URL"),
	affiliateUrl: z.string().url("Invalid affiliate URL"),
	category: z.string(),
	tags: z.array(z.string()),
	commissionRate: z.number().min(0).max(100),
	adminCommission: z.number().min(0).max(100),
	userCommission: z.number().min(0).max(100),
	productInfo: z.object({
		price: z.number().min(0),
		benefits: z.array(z.string()),
		targetAudience: z.array(z.string()),
		specifications: z.record(z.any()),
	}),
});
