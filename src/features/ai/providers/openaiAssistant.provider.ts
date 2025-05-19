import { OPENAI_API_KEY, OPENAI_ASSISTANT_ID, OPENAI_API_ASSISTANT_REF } from "@/local";
import OpenAI from 'openai';
import { IUser } from "@/features/user/models/user.model";
import { logger } from  "@/config/logger";

export interface MessageContent {
  role: string;
  content: any[] | string;
}

export class OpenAIAssistantProvider {
  private openai: OpenAI;
  private readonly defaultModel = 'gpt-4o-mini';

  public constructor(user?: IUser, key?: string) {
    if (user) {
      if (user.openAiKey) {
        this.openai = new OpenAI({
          apiKey: user.openAiKey
        });
      }
    } else {
      if (key) {
        this.openai = new OpenAI({
          apiKey: key
        });
      }
    }

    this.openai = new OpenAI({
      apiKey: OPENAI_API_KEY
    });
  }

  private async runMessage(
    content: MessageContent | MessageContent[],
    assistantInstruction?: string | null,
    maxToken?: number | null,
    temperature?: number,
    jsonResponse?: boolean
  ): Promise<{
    content: string, 
    aiData: {
      provider: string, 
      model: string
  }}> {
    try {
      const assistantId = OPENAI_ASSISTANT_ID;
      const apiPath = OPENAI_API_ASSISTANT_REF || 'beta.threads';
    
      // Dynamically access the API path
      const threadsApi = apiPath.split('.').reduce((obj: { [x: string]: any; }, path: string) => obj[path], this.openai);
      
      const thread = await threadsApi.create();
      await threadsApi.messages.create(thread.id, content);
      const run = await threadsApi.runs.create(thread.id, {
        assistant_id: assistantId,
        instructions: assistantInstruction || undefined,
        max_prompt_tokens: maxToken || 10000,
        temperature: temperature || undefined,
        response_format: jsonResponse ? { type: "json_object" } : undefined
      });

      let runStatus = run.status;
      let runError = "";
      let runIncompleteReason = "";
      let runModel = run.model;
      while (runStatus !== "completed" && runStatus !== "failed" && runStatus !== "cancelled" && runStatus !== "incomplete") {
        await new Promise(resolve => global.setTimeout(resolve, 1000));
        const updatedRun = await threadsApi.runs.retrieve(thread.id, run.id);
        runStatus = updatedRun.status;
        runError = updatedRun.last_error?.message || "";
        runIncompleteReason = updatedRun.incomplete_details?.reason || "";
      }

      if (runStatus === "incomplete") {
        logger.info(`OpenAI Assistant run incomplete due to ${runIncompleteReason}`);
        throw new Error(`OpenAI Assistant run incomplete due to ${runIncompleteReason}`);
      }

      if (runStatus === "failed" || runStatus === "cancelled") {
        logger.error("OpenAI Assistant failed[runStatus]", runStatus);
        throw new Error(`OpenAI Assistant failed [runStatus]: ${runStatus}`);
      }

      const messages = await threadsApi.messages.list(thread.id);
      try {
        const assistantMessage = messages.data.find((msg: { role: string; content: { text: { value: string; }; }; }) => msg.role === "assistant");
  
        if (!assistantMessage) {
          throw new Error("No assistant message found.");
        }
  
        let clearContent = assistantMessage.content.map((part: { text: { value: string; }; }) => {
          if ("text" in part) {
            if (part.text.value.startsWith("```json")) {
              return part.text.value.replace(/^```json\s*|```$/g, "")
            } else {
              return part.text.value
            }
          } else {
            return ""
          }
        });
  
        if (!jsonResponse) {
          clearContent = clearContent.join("\n").trim();
        }
  
        return {
          content: clearContent,
          aiData: {
            provider: "openai",
            model: `assistant: ${runModel}`,
          }
        }
      } catch (error) {
        logger.error(`OpenAI Assistant failed to process the response message: ${JSON.stringify(messages)}`);
        throw new Error(`OpenAI Assistant failed to process the response message: ${JSON.stringify(messages)}`);
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
    prompt: string,
  ): Promise<{content: string, aiData: {provider: string, model: string}}> {
    const content = {
      role: "user",
      content: prompt
    };

    logger.info("generateCompletion", prompt);
    return await this.runMessage(content);
  }

  /**
   * Extract text from image using OpenAI Vision
   */
  public async extractTextFromImage(
    prompt: string,
    imageUrl: string,
    systemPrompt?: string
  ): Promise<{content: string, aiData: {provider: string, model: string}}> {
    try {
      const content = {
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          { type: 'image_url', image_url: { url: imageUrl } }
        ]
      };

      logger.info("extractTextFromImage", content);
      return await this.runMessage(content, systemPrompt, null, 0.7);
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
  ): Promise<{content: string, aiData: {provider: string, model: string}}> {
    try {
      const content = {
        role: 'user',
        content: prompt
      };

      logger.info("generateSystemPromptContent", content);
      return await this.runMessage(content, systemPrompt, null, 0.7, jsonResponse);
    } catch (error) {
      logger.error('OpenAI email generation error:', error);
      throw error;
    }
  }
} 