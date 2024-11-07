import { z } from "zod";
import {
	AIProvider,
	OpenAIModel,
	AnthropicModel,
} from "../models/ai-config.model";

export const aiConfigSchema = z.object({
	provider: z.enum([AIProvider.OPENAI, AIProvider.ANTHROPIC]),
	model: z.string().refine((val) => {
		return [
			...Object.values(OpenAIModel),
			...Object.values(AnthropicModel),
		].includes(val as any);
	}, "Invalid AI model"),
	apiKey: z.string().min(1, "API key is required"),
	temperature: z.number().min(0).max(2).optional().default(0.7),
});

export type AiConfigInput = z.infer<typeof aiConfigSchema>;
