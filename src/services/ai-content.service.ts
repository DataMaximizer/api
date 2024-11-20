import OpenAI from "openai";
import {
	ContentFramework,
	WritingTone,
	ContentVariant,
	ContentTemplate,
	IContentVariant,
} from "../models/ai-content.model";
import { logger } from "../config/logger";
import { OPENAI_API_KEY } from "../local";
import { ContentTemplateService } from "./content-template.service";

export class AIContentService {
	private static readonly openai = new OpenAI({
		apiKey: OPENAI_API_KEY,
	});

	static async generateContentVariants(
		productInfo: any,
		framework: ContentFramework,
		tone: WritingTone,
		numberOfVariants: number = 2,
	): Promise<IContentVariant[]> {
		try {
			const template = await this.getOptimalTemplate(framework, tone);
			const variants: IContentVariant[] = [];

			for (let i = 0; i < numberOfVariants; i++) {
				const content = await this.generateContent(productInfo, template);
				const subject = await this.generateSubject(content);

				const variant = new ContentVariant({
					content,
					subject,
					framework,
					tone,
					status: "draft",
					aiMetadata: {
						promptUsed: template.prompts.content,
						modelVersion: "gpt-4",
						generationParams: { temperature: 0.7 },
						generatedAt: new Date(),
					},
				});

				variants.push(variant);
			}

			return variants;
		} catch (error) {
			logger.error("Error generating content variants:", error);
			throw error;
		}
	}

	private static async getOptimalTemplate(
		framework: ContentFramework,
		tone: WritingTone,
	) {
		const template = await ContentTemplateService.getTemplate(framework, tone);
		if (!template) {
			throw new Error("No template found for the specified framework and tone");
		}
		return template;
	}

	private static async generateContent(
		productInfo: any,
		template: any,
	): Promise<string> {
		const prompt = `
      Generate content using the following template structure:
      ${template.structure}
      
      Product Information:
      ${JSON.stringify(productInfo)}
      
      Writing Style:
      - Framework: ${template.framework}
      - Tone: ${template.tone}
      
      Requirements:
      1. Follow the framework structure strictly
      2. Maintain consistent tone throughout
      3. Include clear call-to-action
      4. Focus on benefits and value proposition
      5. Keep content engaging and conversion-focused
    `;

		const completion = await this.openai.chat.completions.create({
			model: "gpt-4",
			messages: [
				{
					role: "system",
					content:
						"You are an expert email copywriter specializing in high-conversion content.",
				},
				{ role: "user", content: prompt },
			],
		});

		return completion.choices[0].message?.content || "";
	}

	private static async generateSubject(content: string): Promise<string> {
		const prompt = `
      Based on this email content, generate 3 high-converting subject lines.
      Return only the best one that maximizes open rates.
      
      Content: ${content}
      
      Guidelines:
      1. Under 50 characters
      2. Create urgency or curiosity
      3. Avoid spam trigger words
      4. Must be relevant to content
    `;

		const completion = await this.openai.chat.completions.create({
			model: "gpt-4",
			messages: [
				{
					role: "system",
					content:
						"You are an expert in writing high-converting email subject lines.",
				},
				{ role: "user", content: prompt },
			],
		});

		return completion.choices[0].message?.content || "";
	}

	static async updateContentPerformance(
		variantId: string,
		metrics: Partial<IContentVariant["metrics"]>,
	) {
		try {
			const variant = await ContentVariant.findById(variantId);
			if (!variant) return;

			const performance = this.calculatePerformanceScore(metrics);

			await ContentVariant.findByIdAndUpdate(variantId, {
				$inc: {
					"metrics.opens": metrics.opens || 0,
					"metrics.clicks": metrics.clicks || 0,
					"metrics.conversions": metrics.conversions || 0,
					"metrics.revenue": metrics.revenue || 0,
				},
				$set: {
					"performance.score": performance.score,
					"performance.factors": performance.factors,
					"performance.lastUpdated": new Date(),
				},
			});

			await ContentTemplate.findOneAndUpdate(
				{ framework: variant.framework, tone: variant.tone },
				{
					$inc: {
						"successMetrics.totalUsageCount": 1,
					},
					$set: {
						"successMetrics.avgOpenRate": performance.factors.openRate,
						"successMetrics.avgClickRate": performance.factors.clickRate,
						"successMetrics.avgConversionRate":
							performance.factors.conversionRate,
					},
				},
			);
		} catch (error) {
			logger.error("Error updating content performance:", error);
			throw error;
		}
	}

	private static calculatePerformanceScore(
		metrics: Partial<IContentVariant["metrics"]>,
	) {
		const totalSent = metrics.opens || 0;
		const openRate = totalSent > 0 ? (metrics.opens || 0) / totalSent : 0;
		const clickRate = metrics.opens ? (metrics.clicks || 0) / metrics.opens : 0;
		const conversionRate = metrics.clicks
			? (metrics.conversions || 0) / metrics.clicks
			: 0;
		const revenuePerOpen = metrics.opens
			? (metrics.revenue || 0) / metrics.opens
			: 0;

		const weights = {
			openRate: 0.2,
			clickRate: 0.3,
			conversionRate: 0.3,
			revenuePerOpen: 0.2,
		};

		const score =
			openRate * weights.openRate +
			clickRate * weights.clickRate +
			conversionRate * weights.conversionRate +
			revenuePerOpen * weights.revenuePerOpen;

		return {
			score: score * 100,
			factors: {
				openRate,
				clickRate,
				conversionRate,
				revenuePerOpen,
			},
		};
	}

	static async generateAdditionalTags(productInfo: any): Promise<string[]> {
		const prompt = `
    Generate 10 highly specific marketing tags for this product:
    ${JSON.stringify(productInfo)}
    
    Requirements:
    1. Focus on unique selling points
    2. Include target audience segments
    3. Include product benefits
    4. Keep each tag under 3 words
    5. Return only comma-separated tags
  `;

		const completion = await this.openai.chat.completions.create({
			model: "gpt-4",
			messages: [
				{
					role: "system",
					content:
						"You are a product tagging specialist focused on marketing effectiveness.",
				},
				{ role: "user", content: prompt },
			],
		});

		const tags = completion.choices[0].message?.content?.split(",") || [];
		return tags.map((tag) => tag.trim().toLowerCase());
	}
}
