import { OPENAI_API_KEY, OPENAI_MODEL } from "@/local";
import OpenAI from "openai";
import { IUser } from "@/features/user/models/user.model";
import { logger } from "@/config/logger";

// Redefined MessageContent for better type safety with OpenAI SDK
export type MessageContent =
  | { role: "system"; content: string }
  | {
      role: "user";
      content: string | OpenAI.Chat.Completions.ChatCompletionContentPart[];
    }
  | { role: "assistant"; content: string | null };

export class OpenAIProvider {
  private openai: OpenAI;
  private readonly defaultModel = OPENAI_MODEL || "gpt-4o-mini";

  public constructor(user?: IUser, key?: string) {
    if (user) {
      if (user.openAiKey) {
        this.openai = new OpenAI({
          apiKey: user.openAiKey,
        });
      }
    } else {
      if (key) {
        this.openai = new OpenAI({
          apiKey: key,
        });
      }
    }

    this.openai = new OpenAI({
      apiKey: OPENAI_API_KEY,
    });
  }

  private async runMessage(
    content: MessageContent,
    assistantInstruction?: string | null,
    maxToken?: number | null,
    temperature?: number,
    jsonResponse?: boolean
  ): Promise<{
    content: string;
    aiData: {
      provider: string;
      model: string;
    };
  }> {
    try {
      const completion = await this.openai.chat.completions.create({
        model: this.defaultModel,
        messages: assistantInstruction
          ? [{ role: "system", content: assistantInstruction }, content]
          : [content],
        temperature: temperature || undefined,
        max_tokens: maxToken || undefined,
        response_format: jsonResponse ? { type: "json_object" } : undefined,
      });

      try {
        const messageContentFromAPI = completion.choices[0].message?.content;
        const responseText: string = jsonResponse
          ? messageContentFromAPI || "{}"
          : messageContentFromAPI || "";

        return {
          content: responseText,
          aiData: {
            provider: "openai",
            model: `assistant: ${this.defaultModel}`,
          },
        };
      } catch (error) {
        logger.error(
          "OpenAI Assistant failed to process the response message:",
          error
        );
        throw new Error(
          `OpenAI Assistant failed to process the response message: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
    } catch (openaiErr) {
      logger.warn("OpenAI Assistant failed [catch an error]:", openaiErr);
      throw new Error(`OpenAI Assistant failed [catch an error]: ${openaiErr}`);
    }
  }

  /**
   * Generate text completion using OpenAI
   */
  public async generateCompletion(
    prompt: string
  ): Promise<{ content: string; aiData: { provider: string; model: string } }> {
    const contentObj: MessageContent = {
      role: "user",
      content: prompt,
    };

    logger.info("generateCompletion", prompt);
    return await this.runMessage(contentObj);
  }

  /**
   * Extract text from image using OpenAI Vision
   */
  public async extractTextFromImage(
    prompt: string,
    imageUrl: string,
    systemPrompt?: string
  ): Promise<{ content: string; aiData: { provider: string; model: string } }> {
    try {
      const contentObj: MessageContent = {
        role: "user",
        content: [
          { type: "text", text: prompt },
          { type: "image_url", image_url: { url: imageUrl } },
        ],
      };

      logger.info("extractTextFromImage", contentObj);
      return await this.runMessage(contentObj, systemPrompt, null, 0.7);
    } catch (error) {
      logger.error("OpenAI Vision error:", error);
      throw error;
    }
  }

  /**
   * Generate email content using OpenAI
   */
  public async generateSystemPromptContent(
    systemPrompt: string,
    prompt: string,
    jsonResponse?: boolean
  ): Promise<{ content: string; aiData: { provider: string; model: string } }> {
    try {
      const contentObj: MessageContent = {
        role: "user",
        content: prompt,
      };

      logger.info("generateSystemPromptContent", contentObj);
      return await this.runMessage(
        contentObj,
        systemPrompt,
        null,
        0.7,
        jsonResponse
      );
    } catch (error) {
      logger.error("OpenAI email generation error:", error);
      throw error;
    }
  }
}
