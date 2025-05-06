import { CLAUDE_API_KEY, CLAUDE_MODEL } from "@/local";
import { type Anthropic as Claude, Anthropic } from "@anthropic-ai/sdk";
import { TextBlock } from "@anthropic-ai/sdk/resources";
import { IUser } from "@/features/user/models/user.model";
import { logger } from  "@/config/logger";

export interface ClaudeContentSource {
  type: string,
  media_type?: string,
  data: string
}

export interface ClaudeContent {
  type: string,
  text?: string,
  source?: ClaudeContentSource
}
 
export class ClaudeProvider {
  private claude: Claude;

  public constructor(user?: IUser) {
    this.claude = new Anthropic({ apiKey: CLAUDE_API_KEY });

    if (user) {
      if (user.claudeKey) {
        this.claude = new Anthropic({
          apiKey: user.claudeKey
        });
      }
    }
  }

  private async runMessage(
    prompt: ClaudeContent | ClaudeContent[] | string, 
    systemPrompt?: string | null, 
    maxToken?: number, 
    temperature?: number, 
    jsonResponse?: boolean
  ) {
    try {
      const message = await this.claude.messages.create({
        model: CLAUDE_MODEL || "claude-3-sonnet-latest",
        max_tokens: maxToken || 100,
        system: systemPrompt || undefined,
        temperature: temperature || undefined,
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
      });

      let response = (message.content[0] as TextBlock).text;
      
      if (jsonResponse && response.startsWith("```json")) {
        response = response.replace(/```json\n/, "").replace(/\n```$/, "");
      }

      return response;
    } catch (ClaudeErr) {
      logger.warn("Claude failed [catch an error]:", ClaudeErr);
      throw new Error(`Claude failed [catch an error]: ${ClaudeErr}`);
    }
  }

  /**
   * Generate text completion using Claude
   */
  public async generateCompletion(
    prompt: string,
  ): Promise<string> {
    return await this.runMessage(prompt);
  }

  /**
   * Extract text from image using Claude Vision
   */
  public async extractTextFromImage(
    prompt: string,
    format: string,
    base64Image: string,
    systemPrompt?: string,
  ): Promise<string> {
    try {
      return await this.runMessage(
        [
          { type: 'text', text: prompt },
          { type: 'image_url', source: { 
            type: "base64",
            media_type: format === "png" ? "image/png" : "image/jpeg",
            data: base64Image,
          }}
        ], 
        systemPrompt || null, 
        1000
      );
    } catch (error) {
      logger.error('Claude Vision error:', error);
      throw error;
    }
  }

  /**
   * Generate email content using Claude
   */
  public async generateSystemPromptContent(
    systemPrompt: string,
    prompt: string,
    jsonResponse?: boolean
  ): Promise<string> {
    try {
      return await this.runMessage(prompt, systemPrompt, 1000, 0.7, jsonResponse);
    } catch (error) {
      logger.error('Claude email generation error:', error);
      throw error;
    }
  }
} 