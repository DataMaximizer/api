import Tesseract, { createWorker, PSM } from "tesseract.js";

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
      // Limit to fewer languages to reduce memory usage
      // Using just the primary language can significantly reduce memory consumption
      const primaryLanguage = languages[0];

      // Initialize the Tesseract worker with memory-optimized settings
      // The second parameter (1) specifies LSTM only mode to reduce memory usage
      const worker = await createWorker(
        primaryLanguage,
        Tesseract.OEM.LSTM_ONLY,
        {
          // Set cache method to none to avoid storing data in memory
          cacheMethod: "none",
        }
      );

      // Set parameters to optimize for memory usage
      await worker.setParameters({
        // Disable unnecessary features
        tessedit_pageseg_mode: PSM.AUTO, // Automatic page segmentation with OSD
        tessjs_create_hocr: "0", // Don't create HOCR output
        tessjs_create_tsv: "0", // Don't create TSV output
        // Limit image size if needed
        tessjs_image_rectangle: "0,0,0,0", // Process the whole image, adjust if needed
      });

      // Recognize text from the image
      const { data } = await worker.recognize(image);

      // Terminate the worker to free up resources immediately
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
