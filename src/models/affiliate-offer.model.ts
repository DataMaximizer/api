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

export interface IAffiliateOffer extends Document {
	name: string;
	description: string;
	url: string;
	categories: string[];
	tags: string[];
	commissionRate: number;
	status: OfferStatus;
	productInfo: {
		description?: string;
		benefits?: string[];
		pricing?: string;
		targetAudience?: string;
	};
	userId: Schema.Types.ObjectId;
	isAdminOffer: boolean;
	userCommissionRate?: number;
	lastChecked?: Date;
	lastActive?: Date;
	metadata?: Record<string, any>;
	createdAt: Date;
	updatedAt: Date;
}

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
			description: String,
			benefits: [String],
			pricing: String,
			targetAudience: String,
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

offerSchema.index({ status: 1 });
offerSchema.index({ categories: 1 });
offerSchema.index({ tags: 1 });
offerSchema.index({ userId: 1 });

export const AffiliateOffer = mongoose.model<IAffiliateOffer>(
	"AffiliateOffer",
	offerSchema,
);
