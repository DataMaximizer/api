export interface AIInterface {
  /**
   * Generate a text completion from a prompt.
   */
  generateCompletion(prompt: string): Promise<{content: string, aiData: {provider: string, model: string}}>;

  /**
   * Extract text from an image.
   * @param prompt - The prompt or context for extraction.
   * @param formatOrImageUrl - The image format (for Claude) or image URL (for OpenAI).
   * @param base64Image? - (Claude) The base64-encoded image data.
   * @param systemPrompt? - (Claude) Optional system prompt.
   */
  extractTextFromImage(
    prompt: string,
    formatOrImageUrl: string,
    base64Image?: string,
    systemPrompt?: string
  ): Promise<{content: string, aiData: {provider: string, model: string}}>;

  /**
   * Generate content using a system prompt and user prompt.
   * @param systemPrompt - The system prompt/context.
   * @param prompt - The user prompt.
   * @param jsonResponse - Whether to request a JSON response.
   */
  generateSystemPromptContent(
    systemPrompt: string,
    prompt: string,
    jsonResponse?: boolean
  ): Promise<{content: string, aiData: {provider: string, model: string}}>;
} 