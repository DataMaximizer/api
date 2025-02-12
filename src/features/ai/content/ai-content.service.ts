import OpenAI from "openai";
import {
  ContentFramework,
  WritingTone,
  ContentVariant,
  ContentTemplate,
  IContentVariant,
} from "../models/ai-content.model";
import { logger } from "@config/logger";
import { OPENAI_API_KEY } from "@/local";
import { ContentTemplateService } from "@features/email/templates/content-template.service";
import { getAllSpamKeywords, findSpamKeywords } from "./keywords";

export class AIContentService {
  private static readonly openai = new OpenAI({
    apiKey: OPENAI_API_KEY,
  });

  static async generateContentVariants(
    productInfo: any,
    framework: ContentFramework,
    tone: WritingTone,
    numberOfVariants: number = 2
  ): Promise<IContentVariant[]> {
    try {
      const template = await this.getOptimalTemplate(framework, tone);
      const variants: IContentVariant[] = [];

      for (let i = 0; i < numberOfVariants; i++) {
        let content = await this.generateContent(productInfo, template);
        let subject = await this.generateSubject(content);

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
          subject = await this.generateSubject(content);
          attempts++;
        }

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
    tone: WritingTone
  ) {
    const template = await ContentTemplateService.getTemplate(framework, tone);
    if (!template) {
      throw new Error("No template found for the specified framework and tone");
    }
    return template;
  }

  private static async generateContent(
    productInfo: any,
    template: any
  ): Promise<string> {
    const spamKeywords = getAllSpamKeywords();

    const prompt = `
      Create meaningful communication following this structure:
      ${template.structure}
      
      Product Details:
      ${JSON.stringify(productInfo)}
      
      Format Requirements:
      - Use HTML formatting
      - Include section headers with <h2>
      - Use unordered lists (<ul> with <li> items)
      - Bold key benefits with <strong>
      - Maintain clean semantic HTML
      - Do NOT include a subject line
      - Remove unnecessary newlines (\\n) between HTML tags
      
      Communication Guidelines:
      - Apply: ${template.framework}
      - Style: ${template.tone}
      
      Essential Elements:
      1. Adhere to provided structure
      2. Maintain consistent voice
      3. Present specific next steps
      4. Highlight key advantages
      5. Write with authenticity
      6. Use proper HTML syntax
      
      Important - Avoid these terms (full list):
      ${spamKeywords.join(", ")}
      
      Additional Guidelines:
      - Use natural, conversational language
      - Focus on genuine value
      - Avoid hyperbole or excessive claims
      - Write in a professional, straightforward manner
      - Describe features and benefits clearly
      - Use specific, measurable outcomes when possible
      
      HTML Structure Requirements:
      - Section headers using <h2>
      - List items in <ul> with <li> elements
      - Key benefits wrapped in <strong> tags
      - Proper HTML paragraph (<p>) formatting
      - Semantic HTML structure
      - No subject line or header tags
      - No extra newlines between HTML elements
    `;

		const completion = await this.openai.chat.completions.create({
			model: "gpt-4",
			messages: [
				{
					role: "system",
					content:
						"You are a skilled communications specialist focusing on authentic messaging. Avoid using any spam trigger words or phrases that could affect email deliverability.",
				},
				{ role: "user", content: prompt },
			],
		});

		return completion.choices[0].message?.content || "";
	}

	private static async generateSubject(content: string): Promise<string> {
		const spamKeywords = getAllSpamKeywords();

		const prompt = `
      Create a single compelling opening line for this message content that:
      1. Is 50-60 characters maximum
      2. Clearly states the primary value proposition
      3. Uses professional but engaging language
      
      Message Content: ${content}
      
      Requirements:
      1. Maximum 50-60 characters
      2. Focus on relevance and value
      3. Use natural, conversational language
      4. Maintain professionalism
      
      Specifically avoid these terms (full list):
      ${spamKeywords.join(", ")}
      
      Additional Guidelines:
      - Write naturally and professionally
      - Focus on specific, relevant details
      - Avoid marketing language
      - Use clear, direct statements
      - Keep it informative and genuine
      
      Response Format:
      - Only return the subject line itself
      - No quotation marks
      - No numbering
      - Plain text only
    `;

    const completion = await this.openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        {
          role: "system",
          content:
            "You are a communications specialist focused on creating relevant, professional message openings. Avoid any terms that could trigger spam filters.",
        },
        { role: "user", content: prompt },
      ],
    });

    return completion.choices[0].message?.content || "";
  }

  static async updateContentPerformance(
    variantId: string,
    metrics: Partial<IContentVariant["metrics"]>
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
        }
      );
    } catch (error) {
      logger.error("Error updating content performance:", error);
      throw error;
    }
  }

  private static calculatePerformanceScore(
    metrics: Partial<IContentVariant["metrics"]>
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
