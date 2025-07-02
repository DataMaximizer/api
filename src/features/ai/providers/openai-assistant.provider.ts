import { OPENAI_API_KEY } from "@/local";
import OpenAI from "openai";
import { IUser } from "@/features/user/models/user.model";
import { logger } from "@/config/logger";
import fs from "fs";

export class OpenAIAssistantProvider {
  private openai: OpenAI;

  public constructor({ user, key }: { user?: IUser; key?: string }) {
    let apiKey = OPENAI_API_KEY;
    if (user?.openAiKey) {
      apiKey = user.openAiKey;
    } else if (key) {
      apiKey = key;
    }

    this.openai = new OpenAI({
      apiKey,
    });
  }

  public async createAssistant(
    name: string,
    instructions: string,
    model: string,
    filePath?: string,
    jsonResponse?: boolean
  ): Promise<OpenAI.Beta.Assistants.Assistant> {
    try {
      const toolResources: OpenAI.Beta.Assistants.Assistant.ToolResources = {};

      if (filePath) {
        const vectorStore = await this.openai.beta.vectorStores.create({
          name: `${name}-VS`,
        });

        await this.openai.beta.vectorStores.fileBatches.uploadAndPoll(
          vectorStore.id,
          {
            files: [fs.createReadStream(filePath)],
          }
        );
        toolResources.file_search = { vector_store_ids: [vectorStore.id] };
      }

      const assistant = await this.openai.beta.assistants.create({
        name,
        instructions,
        model,
        tools: [{ type: "file_search" }],
        tool_resources: toolResources,
        response_format: jsonResponse ? { type: "json_object" } : undefined,
      });

      return assistant;
    } catch (error) {
      console.error("Error creating assistant:", error);
      throw error;
    }
  }

  public async createAssistantWithFileIds(
    name: string,
    instructions: string,
    model: string,
    fileIds?: string[],
    jsonResponse?: boolean
  ): Promise<OpenAI.Beta.Assistants.Assistant> {
    try {
      const toolResources: OpenAI.Beta.Assistants.Assistant.ToolResources = {};

      if (fileIds && fileIds.length > 0) {
        const vectorStore = await this.openai.beta.vectorStores.create({
          name: `${name}-VS`,
        });

        await this.openai.beta.vectorStores.fileBatches.createAndPoll(
          vectorStore.id,
          { file_ids: fileIds }
        );

        toolResources.file_search = { vector_store_ids: [vectorStore.id] };
      }

      const assistant = await this.openai.beta.assistants.create({
        name,
        instructions,
        model,
        tools: [{ type: "file_search" }],
        tool_resources: toolResources,
        response_format: jsonResponse ? { type: "json_object" } : undefined,
      });

      return assistant;
    } catch (error) {
      console.error("Error creating assistant with file IDs:", error);
      throw error;
    }
  }

  /**
   * Runs the assistant with a given prompt
   */
  public async runAssistant(
    assistantId: string,
    prompt: string,
    threadId?: string
  ): Promise<string> {
    logger.info(
      `Running assistant ${assistantId} with prompt: "${prompt}" on thread ${threadId}`
    );

    try {
      const thread = threadId
        ? { id: threadId }
        : await this.openai.beta.threads.create();

      await this.openai.beta.threads.messages.create(thread.id, {
        role: "user",
        content: prompt,
      });

      const run = await this.openai.beta.threads.runs.create(thread.id, {
        assistant_id: assistantId,
      });

      let runStatus = await this.openai.beta.threads.runs.retrieve(
        thread.id,
        run.id
      );

      while (runStatus.status !== "completed") {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        runStatus = await this.openai.beta.threads.runs.retrieve(
          thread.id,
          run.id
        );
      }

      const messages = await this.openai.beta.threads.messages.list(thread.id);
      const lastMessageForRun = messages.data
        .filter(
          (message) => message.run_id === run.id && message.role === "assistant"
        )
        .pop();

      if (lastMessageForRun && lastMessageForRun.content[0].type === "text") {
        return lastMessageForRun.content[0].text.value;
      }

      return "";
    } catch (error) {
      logger.error("OpenAI Assistant error:", error);
      throw error;
    }
  }
}
