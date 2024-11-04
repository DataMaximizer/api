import mongoose, { Document, Schema } from "mongoose";

export interface IAffiliateOffer extends Document {
	title: string;
	description: string;
	productUrl: string;
	affiliateUrl: string;
	category: Schema.Types.ObjectId;
	tags: string[];
	commissionRate: number;
	adminCommission: number;
	userCommission: number;
	isAdminOffer: boolean;
	userId?: Schema.Types.ObjectId;
	productInfo: {
		price: number;
		benefits: string[];
		targetAudience: string[];
		specifications: Record<string, any>;
	};
	status: "active" | "paused" | "expired";
	lastChecked: Date;
	isUrlValid: boolean;
	aiAnalysis: {
		keywords: string[];
		suggestedCategories: string[];
		productSentiment: number;
		marketPotential: number;
	};
	performance: {
		clicks: number;
		conversions: number;
		revenue: number;
		conversionRate: number;
	};
}

const affiliateOfferSchema = new Schema<IAffiliateOffer>(
	{
		title: { type: String, required: true },
		description: { type: String, required: true },
		productUrl: { type: String, required: true },
		affiliateUrl: { type: String, required: true },
		category: {
			type: Schema.Types.ObjectId,
			ref: "ProductCategory",
			required: true,
		},
		tags: [{ type: String }],
		commissionRate: { type: Number, required: true },
		adminCommission: { type: Number, required: true },
		userCommission: { type: Number, required: true },
		isAdminOffer: { type: Boolean, default: false },
		userId: { type: Schema.Types.ObjectId, ref: "User" },
		productInfo: {
			price: { type: Number, required: true },
			benefits: [{ type: String }],
			targetAudience: [{ type: String }],
			specifications: { type: Schema.Types.Mixed },
		},
		status: {
			type: String,
			enum: ["active", "paused", "expired"],
			default: "active",
		},
		lastChecked: { type: Date },
		isUrlValid: { type: Boolean, default: true },
		aiAnalysis: {
			keywords: [{ type: String }],
			suggestedCategories: [{ type: String }],
			productSentiment: { type: Number },
			marketPotential: { type: Number },
		},
		performance: {
			clicks: { type: Number, default: 0 },
			conversions: { type: Number, default: 0 },
			revenue: { type: Number, default: 0 },
			conversionRate: { type: Number, default: 0 },
		},
	},
	{ timestamps: true },
);

export const AffiliateOffer = mongoose.model<IAffiliateOffer>(
	"AffiliateOffer",
	affiliateOfferSchema,
);
