import { Request, Response, NextFunction } from "express";
import { PromptService } from "./prompt.service";

export class PromptController {
  static async getPrompts(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const prompt = await PromptService.getFirstPrompt();

      if (!prompt) {
        res.status(404).json({ message: "No prompts found" });
        return;
      }

      res.json(prompt);
    } catch (error: any) {
      res.status(500).json({ message: "Error fetching prompts", error });
    }
  }

  static async createPrompt(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { name, text } = req.body;
      const userId = req.user?.id;

      const prompt = await PromptService.createPrompt({ name, text, userId });
      res.status(201).json(prompt);
    } catch (error: any) {
      res.status(500).json({ message: "Error creating prompt", error });
    }
  }

  static async updatePrompt(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { id } = req.params;
      const { text } = req.body;

      const prompt = await PromptService.updatePrompt(id, { text });

      if (!prompt) {
        res.status(404).json({ message: "Prompt not found" });
        return;
      }
      res.json(prompt);
    } catch (error: any) {
      res.status(500).json({ message: "Error updating prompt", error });
    }
  }

  static async deletePrompt(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { id } = req.params;
      const userId = req.user?.id;

      const prompt = await PromptService.deletePrompt(id, userId);

      if (!prompt) {
        res.status(404).json({ message: "Prompt not found" });
        return;
      }

      res.status(200).json({ message: "Prompt deleted successfully" });
    } catch (error: any) {
      res.status(500).json({ message: "Error deleting prompt", error });
    }
  }

  static async testPrompt(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const userId = req.user?.id;

      if (!userId) {
        res.status(401).json({ message: "Unauthorized" });
        return;
      }

      const { offerId, subscriberListId, styleOptions } = req.body;
      const prompt = await PromptService.testPrompt(
        offerId,
        subscriberListId,
        userId,
        styleOptions
      );

      res.json({
        success: true,
        ...prompt,
      });
    } catch (error: any) {
      res.status(500).json({ message: "Error testing prompt", error });
    }
  }
}
