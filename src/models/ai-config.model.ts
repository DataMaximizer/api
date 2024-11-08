import mongoose, { Schema, Document } from "mongoose";

export enum AIProvider {
	OPENAI = "openai",
	ANTHROPIC = "anthropic",
}

export enum OpenAIModel {
	GPT35 = "gpt-3.5-turbo",
	GPT35_16K = "gpt-3.5-turbo-16k",
	GPT4 = "gpt-4",
	GPT4_32K = "gpt-4-32k",
}

export enum AnthropicModel {
	CLAUDE = "claude-2",
	CLAUDE_INSTANT = "claude-instant-1",
}

export interface IAIConfigDocument extends Document {
	userId: Schema.Types.ObjectId;
	provider: AIProvider;
	modelName: string;
	apiKey: string;
	temperature?: number;
	createdAt: Date;
	updatedAt: Date;
}

const aiConfigSchema = new Schema<IAIConfigDocument>(
	{
		userId: {
			type: Schema.Types.ObjectId,
			ref: "User",
			required: true,
			unique: true,
		},
		provider: { type: String, enum: Object.values(AIProvider), required: true },
		modelName: { type: String, required: true },
		apiKey: { type: String, required: true },
		temperature: { type: Number, min: 0, max: 2, default: 0.7 },
	},
	{ timestamps: true },
);

export const AIConfig = mongoose.model<IAIConfigDocument>(
	"AIConfig",
	aiConfigSchema,
);
