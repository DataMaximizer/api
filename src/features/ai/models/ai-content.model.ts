import mongoose, { Document, Schema } from "mongoose";

export enum ContentFramework {
	PAS = "Problem-Agitate-Solution",
	AIDA = "Attention-Interest-Desire-Action",
	BAB = "Before-After-Bridge",
	FOUR_PS = "4Ps",
	FEATURES_BENEFITS = "FEATURES_BENEFITS"
}

export enum WritingTone {
	PROFESSIONAL = "professional",
	FRIENDLY = "friendly",
	URGENT = "urgent",
	CASUAL = "casual",
	HUMOROUS = "humorous",
}

export interface IContentVariant extends Document {
	content: string;
	framework: ContentFramework;
	tone: WritingTone;
	subject?: string;
	preheader?: string;
	metrics: {
		opens: number;
		clicks: number;
		conversions: number;
		revenue: number;
	};
	status: "draft" | "active" | "paused";
	aiMetadata: {
		promptUsed: string;
		modelVersion: string;
		generationParams: Record<string, any>;
		generatedAt: Date;
	};
	performance: {
		score: number;
		lastUpdated: Date;
		factors: {
			openRate: number;
			clickRate: number;
			conversionRate: number;
			revenuePerOpen: number;
		};
	};
	createdAt: Date;
	updatedAt: Date;
}

const contentVariantSchema = new Schema<IContentVariant>(
	{
		content: { type: String, required: true },
		framework: {
			type: String,
			enum: Object.values(ContentFramework),
			required: true,
		},
		tone: {
			type: String,
			enum: Object.values(WritingTone),
			required: true,
		},
		subject: String,
		preheader: String,
		metrics: {
			opens: { type: Number, default: 0 },
			clicks: { type: Number, default: 0 },
			conversions: { type: Number, default: 0 },
			revenue: { type: Number, default: 0 },
		},
		status: {
			type: String,
			enum: ["draft", "active", "paused"],
			default: "draft",
		},
		aiMetadata: {
			promptUsed: String,
			modelVersion: String,
			generationParams: Schema.Types.Mixed,
			generatedAt: Date,
		},
		performance: {
			score: { type: Number, default: 0 },
			lastUpdated: Date,
			factors: {
				openRate: { type: Number, default: 0 },
				clickRate: { type: Number, default: 0 },
				conversionRate: { type: Number, default: 0 },
				revenuePerOpen: { type: Number, default: 0 },
			},
		},
	},
	{ timestamps: true },
);

contentVariantSchema.index({ status: 1 });
contentVariantSchema.index({ "performance.score": -1 });
contentVariantSchema.index({ "metrics.opens": -1 });
contentVariantSchema.index({ "metrics.conversions": -1 });

export const ContentVariant = mongoose.model<IContentVariant>(
	"ContentVariant",
	contentVariantSchema,
);

export interface IContentTemplate extends Document {
	name: string;
	framework: ContentFramework;
	tone: WritingTone;
	structure: string;
	prompts: {
		subject: string;
		content: string;
		preheader?: string;
	};
	successMetrics: {
		avgOpenRate: number;
		avgClickRate: number;
		avgConversionRate: number;
		totalUsageCount: number;
	};
	createdAt: Date;
	updatedAt: Date;
}

const contentTemplateSchema = new Schema<IContentTemplate>(
	{
		name: { type: String, required: true },
		framework: {
			type: String,
			enum: Object.values(ContentFramework),
			required: true,
		},
		tone: {
			type: String,
			enum: Object.values(WritingTone),
			required: true,
		},
		structure: { type: String, required: true },
		prompts: {
			subject: { type: String, required: true },
			content: { type: String, required: true },
			preheader: String,
		},
		successMetrics: {
			avgOpenRate: { type: Number, default: 0 },
			avgClickRate: { type: Number, default: 0 },
			avgConversionRate: { type: Number, default: 0 },
			totalUsageCount: { type: Number, default: 0 },
		},
	},
	{ timestamps: true },
);

contentTemplateSchema.index({ "successMetrics.avgOpenRate": -1 });
contentTemplateSchema.index({ "successMetrics.avgConversionRate": -1 });
contentTemplateSchema.index({ framework: 1, tone: 1 });

export const ContentTemplate = mongoose.model<IContentTemplate>(
	"ContentTemplate",
	contentTemplateSchema,
);
