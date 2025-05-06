import { AIInterface } from "../interfaces/ai.interface";
import { ClaudeProvider } from "./claude.provider";
import { OpenAIProvider } from "./openai.provider";

export class FallbackAiProvider implements AIInterface {
  constructor(
    private primary: OpenAIProvider,
    private fallback: ClaudeProvider
  ) {}

  async generateCompletion(prompt: string): Promise<string> {
    try {
      return await this.primary.generateCompletion(prompt);
    } catch (err) {
      return await this.fallback.generateCompletion(prompt);
    }
  }

  async extractTextFromImage(
    prompt: string,
    formatOrImageUrl: string,
    base64Image?: string,
    systemPrompt?: string
  ): Promise<string> {
    try {
      if (base64Image) {
        const fileImage = await this.base64ToFile(base64Image);
        return await this.primary.extractTextFromImage(prompt, fileImage);
      } else {
        return await this.primary.extractTextFromImage(prompt, formatOrImageUrl);
      }
    } catch (err) {
      if (base64Image) {
        return await this.fallback.extractTextFromImage(prompt, formatOrImageUrl, base64Image, systemPrompt);
      } else {
        const {image, format} = await this.imageUrlToBase64(formatOrImageUrl);
        return await this.fallback.extractTextFromImage(prompt, format, image, systemPrompt);
      }
    }
  }

  async generateSystemPromptContent(
    systemPrompt: string,
    prompt: string,
    jsonResponse?: boolean
  ): Promise<string> {
    try {
      return await this.primary.generateSystemPromptContent(systemPrompt, prompt, jsonResponse);
    } catch (err) {
      return await this.fallback.generateSystemPromptContent(systemPrompt, prompt, jsonResponse);
    }
  }

  async base64ToFile(base64Image: string): Promise<File> {
    const base64Data = base64Image.split(',')[1];

    const byteCharacters = global.atob(base64Data);

    // Create a Uint8Array of the bytes
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);

    // Determine the MIME type if not provided
    const detectedMimeType = base64Image.split(':')[1].split(';')[0];

    // Create the File object
    const file = new File([byteArray], `image.${detectedMimeType}`, { type: detectedMimeType });

    return file;
  }

  async imageUrlToBase64(imageUrl: string): Promise<{image: string, format: string}> {
    const response = await global.fetch(imageUrl);
    const blob = await response.blob();
    const base64Image = await this.blobToBase64(blob);
    const format = blob.type.split("/")[1];
    return {image: base64Image, format};
  }

  async blobToBase64(blob: any): Promise<string> {
    const reader = new global.FileReader();
    reader.readAsDataURL(blob);
    return new Promise((resolve, reject) => {
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error("Failed to convert blob to base64"));
    });
  }
} 