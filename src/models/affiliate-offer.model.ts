import mongoose, { Document, Schema } from "mongoose";

export enum OfferStatus {
	ACTIVE = "active",
	PAUSED = "paused",
	DELETED = "deleted",
}

export interface IOfferCategory {
	name: string;
	description?: string;
}

export interface IProductInfo {
	description?: string;
	benefits?: string[];
	features?: string[]; // Added new field
	pricing?: string;
	targetAudience?: string;
	uniqueSellingPoints?: string[]; // Added new field
	suggestedCategories?: string[]; // Added new field
	marketingHighlights?: string[]; // Added new field for key marketing points
	technicalDetails?: Record<string, any>; // Added for technical specifications
}

export interface IAffiliateOffer extends Document {
	name: string;
	description: string;
	url: string;
	categories: string[];
	tags: string[];
	commissionRate: number;
	status: OfferStatus;
	productInfo: IProductInfo;
	userId: Schema.Types.ObjectId;
	isAdminOffer: boolean;
	userCommissionRate?: number;
	lastChecked?: Date;
	lastActive?: Date;
	metadata?: Record<string, any>;
	createdAt: Date;
	updatedAt: Date;
}

const productInfoSchema = new Schema(
	{
		description: String,
		benefits: [String],
		features: [String], // Added new field
		pricing: String,
		targetAudience: String,
		uniqueSellingPoints: [String], // Added new field
		suggestedCategories: [String], // Added new field
		marketingHighlights: [String], // Added new field
		technicalDetails: Schema.Types.Mixed, // Added new field
	},
	{ _id: false },
);

const offerSchema = new Schema<IAffiliateOffer>(
	{
		name: { type: String, required: true },
		description: { type: String, required: true },
		url: { type: String, required: true },
		categories: [{ type: String, required: true }],
		tags: [{ type: String }],
		commissionRate: { type: Number, required: true },
		status: {
			type: String,
			enum: Object.values(OfferStatus),
			default: OfferStatus.ACTIVE,
		},
		productInfo: {
			type: productInfoSchema,
			default: {},
		},
		userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
		isAdminOffer: { type: Boolean, default: false },
		userCommissionRate: Number,
		lastChecked: Date,
		lastActive: Date,
		metadata: Schema.Types.Mixed,
	},
	{
		timestamps: true,
	},
);

// Indexes for better query performance
offerSchema.index({ status: 1 });
offerSchema.index({ categories: 1 });
offerSchema.index({ tags: 1 });
offerSchema.index({ userId: 1 });
offerSchema.index({ "productInfo.suggestedCategories": 1 }); // Added new index
offerSchema.index({ createdAt: -1 }); // Added index for timestamp sorting
offerSchema.index({
	name: "text",
	description: "text",
	"productInfo.description": "text",
}); // Added text search index

// Pre-save middleware to ensure proper formatting
offerSchema.pre("save", function (next) {
	// Ensure arrays don't have duplicates
	if (this.tags) {
		this.tags = [...new Set(this.tags)];
	}
	if (this.categories) {
		this.categories = [...new Set(this.categories)];
	}
	if (this.productInfo?.suggestedCategories) {
		this.productInfo.suggestedCategories = [
			...new Set(this.productInfo.suggestedCategories),
		];
	}

	// Update lastActive if status is being changed to ACTIVE
	if (this.isModified("status") && this.status === OfferStatus.ACTIVE) {
		this.lastActive = new Date();
	}

	next();
});

offerSchema.virtual("searchableContent").get(function () {
	return `${this.name} ${this.description} ${this.productInfo?.description || ""} ${
		this.productInfo?.benefits?.join(" ") || ""
	} ${this.productInfo?.features?.join(" ") || ""}`.toLowerCase();
});

export const AffiliateOffer = mongoose.model<IAffiliateOffer>(
	"AffiliateOffer",
	offerSchema,
);
