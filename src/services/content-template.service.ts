import {
	ContentTemplate,
	ContentFramework,
	WritingTone,
} from "../models/ai-content.model";
import { logger } from "../config/logger";

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
						subject: this.getSubjectPrompt(framework),
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
						subject: this.getSubjectPrompt(framework),
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
		const structures = {
			[ContentFramework.PAS]: `
1. Problem:
[Identify target audience's pain point]

2. Agitate:
[Expand on the problem and its consequences]

3. Solution:
[Present product as the ideal solution]

4. Call to Action:
[Clear directive with urgency]`,

			[ContentFramework.AIDA]: `
1. Attention:
[Grab attention with powerful opening]

2. Interest:
[Build interest with benefits and features]

3. Desire:
[Create emotional connection and urgency]

4. Action:
[Strong call to action]`,

			[ContentFramework.BAB]: `
1. Before:
[Current situation/problem]

2. After:
[Desired outcome/benefit]

3. Bridge:
[How product bridges the gap]

4. Call to Action:
[Clear next steps]`,

			[ContentFramework.FOUR_PS]: `
1. Problem:
[Identify the problem]

2. Promise:
[Make a bold promise]

3. Proof:
[Provide evidence/credibility]

4. Proposal:
[Present offer and call to action]`,
		};

		return structures[framework] || structures[ContentFramework.AIDA];
	}

	private static getSubjectPrompt(framework: ContentFramework): string {
		const prompts = {
			[ContentFramework.PAS]:
				"Generate a subject line that hints at the problem and solution",
			[ContentFramework.AIDA]: "Create attention-grabbing subject line",
			[ContentFramework.BAB]:
				"Focus subject on transformation from before to after",
			[ContentFramework.FOUR_PS]: "Emphasize the promise in subject line",
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
