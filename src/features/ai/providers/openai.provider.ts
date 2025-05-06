import { OPENAI_API_KEY, OPENAI_ASSISTANT_ID, OPENAI_API_ASSISTANT_REF } from "@/local";
import OpenAI from 'openai';
import { IUser } from '../../user/user.model';
import { logger } from '../../../utils/logger';

export interface MessageContent {
  role: string;
  content: any[] | string;
}

export class OpenAIProvider {
  private static instance: OpenAIProvider;
  private openai: OpenAI;
  private readonly defaultModel = 'gpt-4-turbo-preview';
  private readonly defaultAssistantModel = 'gpt-4-turbo-preview';
  private readonly defaultVisionModel = 'gpt-4-vision-preview';

  public constructor(user?: IUser) {
    this.openai = new OpenAI({
      apiKey: OPENAI_API_KEY
    });

    if (user) {
      if (user.openAiKey) {
        this.openai = new OpenAI({
          apiKey: user.openAiKey
        });
      }
    }
  }

  private async runMessage(content: MessageContent | MessageContent[], maxToken?: number, temperature?: number, jsonResponse?: boolean) {
    try {
      const assistantId = OPENAI_ASSISTANT_ID;
      const apiPath = OPENAI_API_ASSISTANT_REF || 'beta.threads';
    
      // Dynamically access the API path
      const threadsApi = apiPath.split('.').reduce((obj: { [x: string]: any; }, path: string) => obj[path], this.openai);
      
      const thread = await threadsApi.create();
      await threadsApi.messages.create(thread.id, content);
      const run = await threadsApi.runs.create(thread.id, {
        assistant_id: assistantId,
        max_prompt_tokens: maxToken || undefined,
        temperature: temperature || undefined,
        response_format: jsonResponse ? { type: "json_object" } : undefined
      });

      let runStatus = run.status;
      let runError = "";
      while (runStatus !== "completed" && runStatus !== "failed" && runStatus !== "cancelled") {
        await new Promise(resolve => global.setTimeout(resolve, 1000));
        const updatedRun = await threadsApi.runs.retrieve(thread.id, run.id);
        runStatus = updatedRun.status;
        runError = updatedRun.last_error?.message || "";
      }

      if (runStatus === "failed" || runStatus === "cancelled") {
        logger.error("OpenAI Assistant failed[runStatus]", runStatus);
      }

      const messages = await threadsApi.messages.list(thread.id);
      const assistantMessage = messages.data.find((msg: { role: string; content: { text: { value: string; }; }; }) => msg.role === "assistant");

      if (!assistantMessage) {
        throw new Error("No assistant message found.");
      }

      return assistantMessage.content
        .map((part: { text: { value: string; }; }) => ("text" in part ? part.text.value : ""))
        .join("\n")
        .trim();
    } catch (openaiErr) {
      logger.warn("OpenAI Assistant failed [catch an error]:", openaiErr);
      throw new Error(`OpenAI Assistant failed [catch an error]: ${openaiErr}`);
    }
  }

  /**
   * Generate text completion using OpenAI
   */
  public async generateCompletion(
    prompt: string,
  ): Promise<string> {
    return await this.runMessage({
      role: "user",
      content: prompt
    });
  }

  /**
   * Extract text from image using OpenAI Vision
   */
  public async extractTextFromImage(
    text: string,
    imageUrl: string,
  ): Promise<string> {
    try {
      return await this.runMessage({
        role: 'user',
        content: [
          { type: 'text', text: text },
          { type: 'image_url', image_url: { url: imageUrl } }
        ]
      }, 1000);
    } catch (error) {
      logger.error('OpenAI Vision error:', error);
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
  ): Promise<string> {
    try {
      return await this.runMessage(
        [
          {
            role: 'system',
            content: systemPrompt
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        1000, 0.7, jsonResponse
      );
    } catch (error) {
      logger.error('OpenAI email generation error:', error);
      throw error;
    }
  }

  /**
   * Generate writing style recommendations using OpenAI
   */
  public async generateWritingStyleRecommendations(
    prompt: string,
    options: {
      model?: string;
      temperature?: number;
      maxTokens?: number;
      user?: IUser;
    } = {}
  ): Promise<string> {
    try {
      if (options.user) {
        this.initializeWithUserKey(options.user);
      }

      const response = await this.openai.chat.completions.create({
        model: options.model || this.defaultModel,
        messages: [
          {
            role: 'system',
            content: 'You are an expert in email marketing and writing style optimization. Provide specific, actionable recommendations to improve email content.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: options.temperature || 0.7,
        max_tokens: options.maxTokens || 1000,
      });

      return response.choices[0]?.message?.content || '';
    } catch (error) {
      logger.error('OpenAI writing style recommendations error:', error);
      throw error;
    }
  }
} 