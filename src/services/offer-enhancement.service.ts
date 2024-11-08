import OpenAI from "openai";
import { IAffiliateOffer, IProductInfo } from "../models/affiliate-offer.model";
import { logger } from "../config/logger";
import { OPENAI_API_KEY } from "../local";

const CATEGORY_HIERARCHY = {
	electronics: {
		name: "Electronics",
		subcategories: ["Smartphones", "Laptops", "Audio", "Gaming", "Accessories"],
	},
	fashion: {
		name: "Fashion",
		subcategories: [
			"Men's Clothing",
			"Women's Clothing",
			"Shoes",
			"Accessories",
			"Jewelry",
		],
	},
	homeAndLiving: {
		name: "Home & Living",
		subcategories: ["Furniture", "Decor", "Kitchen", "Bedding", "Storage"],
	},
	healthAndBeauty: {
		name: "Health & Beauty",
		subcategories: [
			"Skincare",
			"Makeup",
			"Healthcare",
			"Personal Care",
			"Fitness",
		],
	},
	digital: {
		name: "Digital Products",
		subcategories: [
			"Software",
			"Courses",
			"Ebooks",
			"Templates",
			"Digital Art",
		],
	},
};

interface EnhancedContent {
	description: string;
	detailedDescription: string;
	benefits: string[];
	features: string[];
	targetAudience: string;
	uniqueSellingPoints: string[];
}

export class OfferEnhancementService {
	private static readonly openai = new OpenAI({
		apiKey: OPENAI_API_KEY,
	});

	static async enhanceOfferDescription(
		offer: Partial<IAffiliateOffer>,
	): Promise<Partial<IAffiliateOffer>> {
		try {
			const enhancedContent = await this.generateEnhancedContent(offer);

			const suggestedCategories = await this.suggestCategories(enhancedContent);

			const enhancedProductInfo: IProductInfo = {
				description: enhancedContent.detailedDescription,
				benefits: enhancedContent.benefits,
				features: enhancedContent.features,
				targetAudience: enhancedContent.targetAudience,
				uniqueSellingPoints: enhancedContent.uniqueSellingPoints,
				suggestedCategories: suggestedCategories,
			};

			return {
				...offer,
				description: enhancedContent.description,
				categories: [
					...new Set([...(offer.categories || []), ...suggestedCategories]),
				],
				productInfo: {
					...(offer.productInfo || {}),
					...enhancedProductInfo,
				},
			};
		} catch (error) {
			logger.error("Error enhancing offer description:", error);
			return offer;
		}
	}

	private static async generateEnhancedContent(
		offer: Partial<IAffiliateOffer>,
	): Promise<EnhancedContent> {
		const prompt = `
      Analyze and enhance the following product offer:
      Name: ${offer.name}
      Current Description: ${offer.description}
      URL: ${offer.url}

      Please provide:
      1. A concise, marketing-focused description (max 200 chars)
      2. A detailed description highlighting value proposition
      3. 3-5 key benefits
      4. 3-5 main features
      5. Specific target audience description
      6. 2-3 unique selling points

      Format the response in JSON structure.
    `;

		const completion = await this.openai.chat.completions.create({
			model: "gpt-3.5-turbo",
			messages: [
				{
					role: "system",
					content:
						"You are an e-commerce marketing expert specializing in product descriptions and categorization.",
				},
				{ role: "user", content: prompt },
			],
			response_format: { type: "json_object" },
		});

		const response = JSON.parse(completion.choices[0].message?.content || "{}");

		return {
			description: response.description || offer.description || "",
			detailedDescription: response.detailedDescription || "",
			benefits: response.benefits || [],
			features: response.features || [],
			targetAudience: response.targetAudience || "",
			uniqueSellingPoints: response.uniqueSellingPoints || [],
		};
	}

	private static async suggestCategories(
		enhancedContent: EnhancedContent,
	): Promise<string[]> {
		const prompt = `
      Based on this product information:
      ${JSON.stringify(enhancedContent)}

      Suggest the most appropriate category and subcategory from this hierarchy:
      ${JSON.stringify(CATEGORY_HIERARCHY)}

      Return only the category names as a JSON array of strings.
    `;

		const completion = await this.openai.chat.completions.create({
			model: "gpt-3.5-turbo",
			messages: [
				{
					role: "system",
					content:
						"You are a product categorization expert. Return only the requested category names as a JSON array.",
				},
				{ role: "user", content: prompt },
			],
			response_format: { type: "json_object" },
		});

		const response = JSON.parse(completion.choices[0].message?.content || "[]");
		return response.categories || [];
	}

	static validateCategories(categories: string[]): string[] {
		const validCategories = new Set();

		for (const category of categories) {
			for (const [mainCategory, data] of Object.entries(CATEGORY_HIERARCHY)) {
				if (
					category.toLowerCase() === mainCategory.toLowerCase() ||
					data.subcategories.some(
						(sub) => sub.toLowerCase() === category.toLowerCase(),
					)
				) {
					validCategories.add(category);
				}
			}
		}

		return Array.from(validCategories) as string[];
	}
}
