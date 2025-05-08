import Tesseract, { createWorker, PSM } from "tesseract.js";
import axios from "axios";
import { Anthropic } from "@anthropic-ai/sdk";
import { TextBlock } from "@anthropic-ai/sdk/resources";
import sharp from "sharp";
import { OpenAIProvider } from "../providers/openai.provider";
import { ClaudeProvider } from "../providers/claude.provider";
import { FallbackAiProvider } from "../providers/fallback.provider";

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

  /**
   * Extracts text from an image using OpenAI's Vision API
   * @param image - The image buffer or base64 string
   * @returns Promise containing the extracted text
   */
  async extractTextWithOpenAI(
    image: Buffer | string,
    openAiKey: string
  ): Promise<string> {
    try {
      // Convert buffer to base64 if needed
      const base64Image = Buffer.isBuffer(image)
        ? image.toString("base64")
        : typeof image === "string" &&
          !image.startsWith("data:") &&
          !image.startsWith("http")
        ? Buffer.from(image).toString("base64")
        : image;

      // Prepare the image content for the API
      const content =
        typeof base64Image === "string" &&
        (base64Image.startsWith("data:") || base64Image.startsWith("http"))
          ? base64Image // URL or data URL
          : `data:image/jpeg;base64,${base64Image}`; // Base64

      const aiclient = new FallbackAiProvider({});
      const prompt = "Extract all text from this image. Return only the extracted text without any additional commentary.";
      const result: { content: string } = await aiclient.extractTextFromImage(prompt, content);
      
      return result.content || "";
    } catch (error) {
      console.error("Error extracting text with OpenAI:", error);
      throw new Error("Failed to extract text with OpenAI");
    }
  }

  /**
   * Extracts text from an image using Claude's Vision capabilities
   * @param image - The image buffer or base64 string
   * @param anthropicApiKey - Anthropic API key
   * @returns Promise containing the extracted text
   */
  async extractTextWithClaude(
    image: Buffer | string,
  ): Promise<string> {
    try {
      // Convert to buffer for processing if it's not already
      let imageBuffer: Buffer;
      if (Buffer.isBuffer(image)) {
        imageBuffer = image;
      } else if (typeof image === "string") {
        if (image.startsWith("data:")) {
          // Handle data URL
          const base64Data = image.split(",")[1];
          imageBuffer = Buffer.from(base64Data, "base64");
        } else if (image.startsWith("http")) {
          // Handle URL
          imageBuffer = await this.fetchImageAsBuffer(image);
        } else {
          // Handle base64 string
          imageBuffer = Buffer.from(image, "base64");
        }
      } else {
        throw new Error("Unsupported image format");
      }

      // Compress the image if needed and get format info
      const { buffer: compressedImageBuffer, format } =
        await this.compressImage(imageBuffer);

      // Convert compressed buffer to base64
      const base64Image = compressedImageBuffer.toString("base64");

      // Initialize Anthropic client
      const client = new FallbackAiProvider({});
      const result: { content: string } = await client.extractTextFromImage(
        "Please extract and transcribe all visible text from this image. Only return the exact text you see, with no additional commentary or explanations.",
        format,
        base64Image,
        "You are an OCR system. Your only function is to output the text visible in images. Extract and transcribe all visible text from the provided image. Return only the extracted text without any commentary, explanations, or refusals."
      );

      return result.content || "";
    } catch (error: any) {
      console.error("Error extracting text with Claude:", error);

      // Handle specific Claude API errors
      if (error instanceof Anthropic.APIError) {
        if (error.status === 429) {
          throw new Error(
            "Claude API rate limit exceeded. Please try again later."
          );
        } else if (error.status === 500 || error.status === 503) {
          throw new Error(
            "Claude API is currently overloaded or unavailable. Please try again later."
          );
        }
      }

      throw new Error(
        `Failed to extract text with Claude: ${
          error.message || "Unknown error"
        }`
      );
    }
  }

  /**
   * Helper method to fetch an image from a URL as a buffer
   * @param url - The URL of the image
   * @returns Promise containing the image buffer
   */
  private async fetchImageAsBuffer(url: string): Promise<Buffer> {
    try {
      const response = await axios.get(url, { responseType: "arraybuffer" });
      return Buffer.from(response.data);
    } catch (error) {
      console.error("Error fetching image:", error);
      throw new Error("Failed to fetch image from URL");
    }
  }

  /**
   * Compresses an image to ensure it's under the 5MB limit for Claude
   * and dimensions are within Claude's limits (max 8000 pixels per dimension)
   * @param imageBuffer - The image buffer to compress
   * @returns Promise containing the compressed image buffer and format
   */
  private async compressImage(
    imageBuffer: Buffer
  ): Promise<{ buffer: Buffer; format: string }> {
    try {
      // Check if the image is already under 5MB
      const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5MB
      const MAX_DIMENSION = 7900; // Slightly under Claude's 8000 pixel limit to be safe

      // Get image metadata to check dimensions and format
      const metadata = await sharp(imageBuffer).metadata();
      const width = metadata.width || 0;
      const height = metadata.height || 0;

      // Determine the image format (default to jpeg if unknown)
      let imageFormat = metadata.format || "jpeg";

      // If image is small enough in both size and dimensions, return as is
      if (
        imageBuffer.length <= MAX_SIZE_BYTES &&
        width <= MAX_DIMENSION &&
        height <= MAX_DIMENSION
      ) {
        return { buffer: imageBuffer, format: imageFormat };
      }

      // Calculate resize dimensions to maintain aspect ratio
      let resizeWidth = width;
      let resizeHeight = height;

      if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
        const aspectRatio = width / height;

        if (width > height) {
          resizeWidth = Math.min(width, MAX_DIMENSION);
          resizeHeight = Math.round(resizeWidth / aspectRatio);
        } else {
          resizeHeight = Math.min(height, MAX_DIMENSION);
          resizeWidth = Math.round(resizeHeight * aspectRatio);
        }

        // Double-check the other dimension isn't still too large
        if (resizeWidth > MAX_DIMENSION) {
          resizeWidth = MAX_DIMENSION;
          resizeHeight = Math.round(resizeWidth / aspectRatio);
        } else if (resizeHeight > MAX_DIMENSION) {
          resizeHeight = MAX_DIMENSION;
          resizeWidth = Math.round(resizeHeight * aspectRatio);
        }
      }

      // Start with reasonable quality and resized dimensions
      let quality = 80;
      let compressedBuffer: Buffer;

      // Use the appropriate format for compression
      if (imageFormat === "png") {
        compressedBuffer = await sharp(imageBuffer)
          .resize({
            width: resizeWidth,
            height: resizeHeight,
            fit: "inside",
            withoutEnlargement: true,
          })
          .png({ quality })
          .toBuffer();
      } else {
        // Default to jpeg for all other formats for better compression
        compressedBuffer = await sharp(imageBuffer)
          .resize({
            width: resizeWidth,
            height: resizeHeight,
            fit: "inside",
            withoutEnlargement: true,
          })
          .jpeg({ quality })
          .toBuffer();

        // Update format to jpeg since we converted it
        imageFormat = "jpeg";
      }

      // If still too large, compress more aggressively
      while (compressedBuffer.length > MAX_SIZE_BYTES && quality > 10) {
        // Reduce quality by 10% each time
        quality -= 10;

        // If we're at minimum quality, start reducing dimensions further
        if (quality <= 10) {
          resizeWidth = Math.round(resizeWidth * 0.8);
          resizeHeight = Math.round(resizeHeight * 0.8);
        }

        // Compress with the appropriate format
        if (imageFormat === "png") {
          compressedBuffer = await sharp(imageBuffer)
            .resize({
              width: resizeWidth,
              height: resizeHeight,
              fit: "inside",
              withoutEnlargement: true,
            })
            .png({ quality })
            .toBuffer();
        } else {
          compressedBuffer = await sharp(imageBuffer)
            .resize({
              width: resizeWidth,
              height: resizeHeight,
              fit: "inside",
              withoutEnlargement: true,
            })
            .jpeg({ quality })
            .toBuffer();
        }
      }

      // If we still can't get it under 5MB, make one final aggressive attempt
      // Convert to JPEG regardless of original format for maximum compression
      if (compressedBuffer.length > MAX_SIZE_BYTES) {
        compressedBuffer = await sharp(imageBuffer)
          .resize({
            width: 1000,
            height: 1000,
            fit: "inside",
            withoutEnlargement: true,
          })
          .jpeg({ quality: 10 })
          .toBuffer();

        // Update format since we converted to jpeg
        imageFormat = "jpeg";
      }

      console.log(
        `Compressed image from ${imageBuffer.length} to ${compressedBuffer.length} bytes, ` +
          `dimensions from ${width}x${height} to ${resizeWidth}x${resizeHeight}, ` +
          `format: ${imageFormat}`
      );

      return { buffer: compressedBuffer, format: imageFormat };
    } catch (error) {
      console.error("Error compressing image:", error);
      // Return original if compression fails, assuming jpeg format if unknown
      let imageFormat = "jpeg";
      try {
        // Try to get the actual format
        const metadata = await sharp(imageBuffer).metadata();
        if (metadata.format) {
          imageFormat = metadata.format;
        }
      } catch (e) {
        // Ignore errors in error handler
      }
      return { buffer: imageBuffer, format: imageFormat };
    }
  }
}

export const aiService = new AIService();
