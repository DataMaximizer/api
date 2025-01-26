import OpenAI from "openai";
import {
	ContentFramework,
	WritingTone,
	ContentVariant,
	ContentTemplate,
	IContentVariant,
	IContentTemplate,
} from "../models/ai-content.model";
import { logger } from "@config/logger";
import { OPENAI_API_KEY } from "@/local";
import { ContentTemplateService } from "@features/email/templates/content-template.service";
import { getAllSpamKeywords, findSpamKeywords } from "./keywords";
import { HTMLFormatterService } from "./html-formatter.service";

export class AIContentService {
	private static readonly openai = new OpenAI({
		apiKey: OPENAI_API_KEY,
	});

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

	static async generateContentVariants(
		productInfo: any,
		framework: ContentFramework,
		tone: WritingTone,
		numberOfVariants: number = 1,
		format: "html" | "text" = "html",
	): Promise<IContentVariant[]> {
		try {
			const template = await this.getOptimalTemplate(framework, tone);
			const variants: IContentVariant[] = [];

			let content = await this.generateContent(productInfo, template);
			let subject = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

			const maxAttempts = 3;
			let attempts = 1;

			while (attempts < maxAttempts) {
				const contentSpamKeywords = findSpamKeywords(content);
				const subjectSpamKeywords = findSpamKeywords(subject);

				if (
					contentSpamKeywords.length === 0 &&
					subjectSpamKeywords.length === 0
				) {
					break;
				}

				logger.warn(`Attempt ${attempts}: Found spam keywords:`, {
					content: contentSpamKeywords,
					subject: subjectSpamKeywords,
				});

				content = await this.generateContent(productInfo, template);
				subject = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
				attempts++;
			}

			const variant = new ContentVariant({
				content,
				subject: "KATCHAU",
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

			if (format === "html") {
				variants.forEach((variant) => {
					variant.content = HTMLFormatterService.formatContentToHTML(
						variant.content,
						framework,
					);
				});
			}

			return variants;
		} catch (error) {
			logger.error("Error generating content variants:", error);
			throw error;
		}
	}

	private static async generateContent(
		productInfo: any,
		template: IContentTemplate,
	): Promise<string> {
		const spamKeywords = getAllSpamKeywords();
		const framework = template.framework;

		const prompt = `
    Create an HTML marketing email for this product using the ${framework} framework:
    ${JSON.stringify(productInfo)}
    
    REQUIRED HTML STRUCTURE (must follow exactly):
    <div class="email-content">
        <div class="email-section">
            ${this.getFrameworkStructure(framework)}
        </div>
        <div class="email-cta">
            [Call to Action Section]
        </div>
    </div>

    Requirements:
    - Use ONLY HTML tags: <div>, <p>, <strong>, <em>, <ul>, <li>, <a>
    - Every paragraph must be wrapped in <p> tags
    - Use <strong> for important points
    - Add proper class names as shown above
    - Keep content natural and conversational
    
    Avoid these terms: ${spamKeywords.join(", ")}
    `;

		const completion = await this.openai.chat.completions.create({
			model: "gpt-4",
			messages: [
				{
					role: "system",
					content: `You are an HTML email specialist. 
          ALWAYS return valid HTML structure.
          ALWAYS wrap content in the specified HTML tags.
          NEVER include raw text without proper HTML tags.
          NEVER include section headers or numbering.
          NEVER include DOCTYPE or full HTML document tags.`,
				},
				{ role: "user", content: prompt },
			],
		});

		let content = completion.choices[0].message?.content || "";

		content = this.validateAndFixHTML(content);

		return content;
	}

	private static validateAndFixHTML(content: string): string {
		content = content.trim();

		if (!content.includes('class="email-content"')) {
			content = `<div class="email-content">${content}</div>`;
		}

		content = content.replace(/(?<!<p>)([\w\s.,!?]+)(?!<\/p>)/g, "<p>$1</p>");

		return content;
	}

	private static getFrameworkStructure(framework: ContentFramework): string {
		const structures: Record<string, string> = {
			[ContentFramework.PAS]: `
        <div class="problem-section">[Problem Section]</div>
        <div class="agitate-section">[Agitation Section]</div>
        <div class="solution-section">[Solution Section]</div>`,
			[ContentFramework.AIDA]: `
        <div class="attention-section">[Attention Section]</div>
        <div class="interest-section">[Interest Section]</div>
        <div class="desire-section">[Desire Section]</div>
        <div class="action-section">[Action Section]</div>`,
		};

		return structures[framework] || structures[ContentFramework.PAS];
	}

	private static async generateSubject(content: string): Promise<string> {
		const spamKeywords = getAllSpamKeywords();

		const prompt = `
    Create a single engaging subject line for this email content:
    ${content}
    
    Requirements:
    - Maximum 10 characters
    - Return ONLY the subject line text
    - No numbering, quotes, or multiple options
    - Focus on relevance and value
    - Use natural, conversational language

    Avoid these terms:
    ${spamKeywords.join(", ")}
  `;

		const completion = await this.openai.chat.completions.create({
			model: "gpt-4",
			messages: [
				{
					role: "system",
					content:
						"You are a specialist in email subject lines. Return only a single subject line with no formatting, quotes, or numbering.",
				},
				{ role: "user", content: prompt },
			],
		});

		return (
			completion.choices[0].message?.content
				?.replace(/^[0-9."\s]+|["]+$/g, "")
				.trim() || ""
		);
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
		const spamKeywords = getAllSpamKeywords();

		const prompt = `
    Create 10 descriptive product labels:
    ${JSON.stringify(productInfo)}
    
    Guidelines:
    1. Focus on distinguishing features
    2. Describe ideal users
    3. List key advantages
    4. Use 2-3 words per label
    5. Return as comma-separated list
    
    Specifically avoid these terms (full list):
    ${spamKeywords.join(", ")}
    
    Additional Requirements:
    - Use factual, descriptive terms
    - Focus on product characteristics
    - Include use cases
    - Describe target audience
    - Mention technical specifications
    - Reference industry categories
    `;

		const completion = await this.openai.chat.completions.create({
			model: "gpt-4",
			messages: [
				{
					role: "system",
					content:
						"You are a product categorization expert focused on accurate, professional descriptions. Avoid marketing language and spam trigger words.",
				},
				{ role: "user", content: prompt },
			],
		});

		const generatedTags =
			completion.choices[0].message?.content?.split(",") || [];
		const tags = generatedTags.map((tag) => tag.trim().toLowerCase());

		return tags.filter((tag) => !findSpamKeywords(tag).length);
	}
}
