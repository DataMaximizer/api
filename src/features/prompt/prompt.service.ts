import { Prompt, IPrompt } from "@/features/prompt/prompt.model";
import { CampaignService } from "../campaign/campaign.service";
import { AffiliateOffer } from "../affiliate/models/affiliate-offer.model";
import { SubscriberList } from "../subscriber/models/subscriber-list.model";
import { UserService } from "../user/user.service";
export class PromptService {
  /**
   * Get the first prompt from the database, sorted by creation date
   * @returns Promise with the first prompt or null if none exist
   */
  static async getFirstPrompt(): Promise<IPrompt | null> {
    try {
      const prompt = await Prompt.findOne().sort({ createdAt: 1 }).limit(1);
      return prompt;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Get all prompts by a specific user ID
   * @param userId - The ID of the user
   * @returns Promise with an array of prompts
   */
  static async getPromptsByUser(userId: string): Promise<IPrompt[]> {
    try {
      const prompts = await Prompt.find({ userId });
      return prompts;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Get a prompt by its ID
   * @param id - The ID of the prompt
   * @returns Promise with the prompt or null if not found
   */
  static async getPromptById(id: string): Promise<IPrompt | null> {
    try {
      const prompt = await Prompt.findById(id);
      return prompt;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Create a new prompt
   * @param data - The prompt data (name, text, userId)
   * @returns Promise with the created prompt
   */
  static async createPrompt(data: {
    name: string;
    text: string;
    userId: string;
  }): Promise<IPrompt> {
    try {
      const prompt = new Prompt(data);
      await prompt.save();
      return prompt;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Update an existing prompt
   * @param id - The ID of the prompt to update
   * @param data - The updated prompt data (name, text)
   * @returns Promise with the updated prompt or null if not found
   */
  static async updatePrompt(
    id: string,
    data: { text?: string }
  ): Promise<IPrompt | null> {
    try {
      const prompt = await Prompt.findByIdAndUpdate(id, data, {
        new: true,
        runValidators: true,
      });
      return prompt;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Delete a prompt by its ID and user ID
   * @param id - The ID of the prompt
   * @param userId - The ID of the user
   * @returns Promise with the deleted prompt or null if not found
   */
  static async deletePrompt(
    id: string,
    userId: string
  ): Promise<IPrompt | null> {
    try {
      const prompt = await Prompt.findOneAndDelete({ _id: id, userId });
      return prompt;
    } catch (error) {
      throw error;
    }
  }

  static async testPrompt(
    offerId: string,
    subscriberListId: string,
    userId: string,
    styleOptions: {
      copywritingStyle: string;
      writingStyle: string;
      tone: string;
      personality: string;
    }
  ): Promise<{
    openAI: {
      subject: string;
      content: string;
    };
    claude: {
      subject: string;
      content: string;
    };
    prompt: string;
  }> {
    const offer = await AffiliateOffer.findById(offerId);
    if (!offer) {
      throw new Error("Offer not found");
    }

    const subscriberList = await SubscriberList.findById(subscriberListId);
    if (!subscriberList) {
      throw new Error("Subscriber list not found");
    }

    const prompt = await CampaignService.generateEmailPrompt(
      offer,
      styleOptions.copywritingStyle,
      styleOptions.tone,
      styleOptions.personality,
      styleOptions.writingStyle,
      subscriberList.description
    );

    const keys = await UserService.getUserApiKeys(userId);

    const openAIResult = await CampaignService.generateOpenAIEmailContent(
      prompt,
      true,
      keys.openAiKey
    );

    const claudeResult = await CampaignService.generateClaudeEmailContent(
      prompt,
      true,
      keys.claudeKey
    );

    const openAIContent = JSON.parse(openAIResult);
    const claudeContent = JSON.parse(claudeResult);

    return {
      openAI: {
        subject: openAIContent.subject,
        content: openAIContent.body,
      },
      claude: {
        subject: claudeContent.subject,
        content: claudeContent.body,
      },
      prompt,
    };
  }
}
