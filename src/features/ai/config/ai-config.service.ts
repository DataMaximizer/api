import { AIConfig, IAIConfigDocument } from "../models/ai-config.model";
import { AiConfigInput } from "@core/utils/validators/validations/ai-config.validation";
import { logger } from "@config/logger";

export class AIConfigService {
  static async getConfig(userId: string): Promise<IAIConfigDocument | null> {
    try {
      return await AIConfig.findOne({ userId });
    } catch (error) {
      logger.error("Error fetching AI config:", error);
      throw error;
    }
  }

  static async updateConfig(
    userId: string,
    configData: AiConfigInput,
  ): Promise<IAIConfigDocument> {
    try {
      const config = await AIConfig.findOneAndUpdate(
        { userId },
        {
          userId,
          provider: configData.provider,
          modelName: configData.model,
          apiKey: configData.apiKey,
          temperature: configData.temperature,
        },
        { new: true, upsert: true },
      );

      return config;
    } catch (error) {
      logger.error("Error updating AI config:", error);
      throw error;
    }
  }

  static async deleteConfig(userId: string): Promise<void> {
    try {
      await AIConfig.findOneAndDelete({ userId });
    } catch (error) {
      logger.error("Error deleting AI config:", error);
      throw error;
    }
  }

  static async validateApiKey(
    provider: string,
    apiKey: string,
  ): Promise<boolean> {
    try {
      switch (provider) {
        case "openai":
          const OpenAI = require("openai");
          const openai = new OpenAI({ apiKey });
          await openai.models.list();
          break;

        case "anthropic":
          const Anthropic = require("@anthropic-ai/sdk");
          const anthropic = new Anthropic({ apiKey });
          await anthropic.messages.create({
            model: "claude-3-opus-20240229",
            max_tokens: 1,
            messages: [{ role: "user", content: "test" }],
          });
          break;

        default:
          throw new Error("Unsupported AI provider");
      }

      return true;
    } catch (error) {
      logger.error(`Error validating ${provider} API key:`, error);
      return false;
    }
  }
}
