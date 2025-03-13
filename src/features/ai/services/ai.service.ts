import { createWorker } from "tesseract.js";

export class AIService {
  /**
   * Extracts text from an image using Tesseract.js OCR
   * @param image - The image buffer or path to analyze
   * @param languages - Array of language codes to use for OCR (default: ['eng'])
   * @returns Promise containing the extracted text
   */
  async extractTextFromImage(
    image: Buffer | string,
    languages: string[] = ["eng", "spa", "por"]
  ): Promise<string> {
    try {
      // Initialize the Tesseract worker with the specified languages
      // The createWorker function accepts an array of languages directly
      const worker = await createWorker(languages);

      // Recognize text from the image
      const { data } = await worker.recognize(image);

      // Terminate the worker to free up resources
      await worker.terminate();

      // Return the extracted text
      return data.text;
    } catch (error) {
      console.error("Error extracting text from image:", error);
      throw new Error("Failed to extract text from image");
    }
  }
}

export const aiService = new AIService();
