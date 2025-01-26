import {
	ContentTemplate,
	ContentFramework,
	WritingTone,
} from "@features/ai/models/ai-content.model";
import { logger } from "@config/logger";

export class ContentTemplateService {
	static async ensureDefaultTemplatesExist() {
		try {
			const count = await ContentTemplate.countDocuments();
			if (count === 0) {
				logger.info("Creating default content templates...");
				await this.createDefaultTemplates();
			}
		} catch (error) {
			logger.error("Error ensuring default templates:", error);
			throw error;
		}
	}

	static async createDefaultTemplates() {
		const frameworks = Object.values(ContentFramework);
		const tones = Object.values(WritingTone);

		const defaultTemplates = [];

		for (const framework of frameworks) {
			for (const tone of tones) {
				const template = {
					name: `${framework} - ${tone}`,
					framework,
					tone,
					structure: this.getFrameworkStructure(framework),
					prompts: {
						subject: "UUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUu",
						content: this.getContentPrompt(framework, tone),
					},
					successMetrics: {
						avgOpenRate: 0,
						avgClickRate: 0,
						avgConversionRate: 0,
						totalUsageCount: 0,
					},
				};
				defaultTemplates.push(template);
			}
		}

		try {
			await ContentTemplate.insertMany(defaultTemplates);
			logger.info(`Created ${defaultTemplates.length} templates`);
		} catch (error) {
			logger.error("Error creating templates:", error);
			throw error;
		}
	}

	static async getTemplate(framework: ContentFramework, tone: WritingTone) {
		try {
			logger.info(
				`Fetching template for framework: ${framework}, tone: ${tone}`,
			);

			let template = await ContentTemplate.findOne({
				framework: framework.toString(),
				tone: tone.toString(),
			});

			if (!template) {
				logger.warn(
					`No template found for ${framework} - ${tone}, creating new one...`,
				);
				template = await ContentTemplate.create({
					name: `${framework} - ${tone}`,
					framework,
					tone,
					structure: this.getFrameworkStructure(framework),
					prompts: {
						subject: "uuuuuuuuuuuuuuuuuuuuuuu",
						content: this.getContentPrompt(framework, tone),
					},
					successMetrics: {
						avgOpenRate: 0,
						avgClickRate: 0,
						avgConversionRate: 0,
						totalUsageCount: 0,
					},
				});
			}

			return template;
		} catch (error) {
			logger.error(`Error getting template for ${framework} - ${tone}:`, error);
			throw error;
		}
	}

	private static getFrameworkStructure(framework: ContentFramework): string {
		const structures: Record<string, string> = {
			[ContentFramework.PAS]: `
Write a natural flowing email that:
- Opens by identifying the target audience's pain point
- Expands on the problem and its consequences
- Presents your product as the ideal solution
- Ends with a clear, urgent call to action`,

			[ContentFramework.AIDA]: `
Write a natural flowing email that:
- Opens with a powerful attention-grabbing statement
- Builds interest by highlighting benefits and features
- Creates emotional connection and sense of urgency
- Ends with a strong call to action`,

			[ContentFramework.BAB]: `
Write a natural flowing email that:
- Describes the current situation or problem
- Paints a picture of the desired outcome and benefits
- Shows how your product bridges that gap
- Ends with clear next steps`,

			[ContentFramework.FOUR_PS]: `
Write a natural flowing email that:
- Identifies the core problem
- Makes a compelling promise
- Provides credible evidence
- Presents a clear offer and call to action`,

			[ContentFramework.FEATURES_BENEFITS]: `Write a natural flowing email that:
- Opens with key product features
- Explains benefits for each feature
- Demonstrates value proposition
- Ends with clear call to action`,
		};

		return structures[framework] || structures[ContentFramework.AIDA];
	}

	private static getSubjectPrompt(framework: ContentFramework): string {
		const prompts: Record<string, string> = {
			[ContentFramework.PAS]:
				"Generate a subject line that hints at the problem and solution",
			[ContentFramework.AIDA]: "Create attention-grabbing subject line",
			[ContentFramework.BAB]:
				"Focus subject on transformation from before to after",
			[ContentFramework.FOUR_PS]: "Emphasize the promise in subject line",
			[ContentFramework.FEATURES_BENEFITS]:
				"Highlight key feature in subject line",
		};

		return prompts[framework] || prompts[ContentFramework.AIDA];
	}

	private static getContentPrompt(
		framework: ContentFramework,
		tone: WritingTone,
	): string {
		return `Create email content using the ${framework} framework with a ${tone} tone. Follow the structure provided and ensure the content is engaging and persuasive.`;
	}
}
