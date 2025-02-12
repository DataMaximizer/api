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
1. Identify target audience's pain point
2. Expand on the problem and its consequences
3. Present product as the ideal solution
4. Clear directive with urgency`,

      [ContentFramework.AIDA]: `
1. Grab attention with powerful opening
2. Build interest with benefits and features
3. Create emotional connection and urgency
4. Strong call to action`,

      [ContentFramework.BAB]: `
1. Describe current situation/problem
2. Paint desired outcome/benefit
3. Explain how product bridges the gap
4. Clear next steps`,

      [ContentFramework.FOUR_PS]: `
1. Identify the core challenge
2. Make a compelling commitment
3. Provide evidence/credibility
4. Present offer and final action step`
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
    return `Create email content using the ${framework} framework with ${tone} tone. Focus on natural flow between concepts without section headers. Use persuasive language and maintain professional tone.`;
  }
}
