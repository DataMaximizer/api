import mongoose, { Document, Schema, Types } from "mongoose";

export interface IInteraction {
	type: "open" | "click" | "conversion";
	timestamp: Date;
	campaignId?: Types.ObjectId;
	linkId?: string;
	metadata?: Record<string, any>;
	interactions?: string | number;
}

export interface IMetrics {
	opens: number;
	clicks: number;
	conversions: number;
	bounces: number;
	revenue: number;
	lastOpen?: Date;
	lastClick?: Date;
	interactions?: IInteraction[];
}

export interface ISubscriber extends Document {
	userId: Types.ObjectId;
	email: string;
	status: "active" | "unsubscribed" | "bounced" | "inactive";
	tags: string[];
	lists: Types.ObjectId[]; // Add this field
	lastInteraction: Date;
	engagementScore: number;
	metadata: {
		ip?: string;
		userAgent?: string;
		source?: string;
	};
	metrics: {
		opens: number;
		clicks: number;
		conversions: number;
		bounces: number;
		revenue: number;
	};
	data: Record<string, any>;
	createdAt: Date;
	updatedAt: Date;
}

const interactionSchema = new Schema<IInteraction>(
	{
		type: {
			type: String,
			enum: ["open", "click", "conversion"],
			required: true,
		},
		timestamp: { type: Date, default: Date.now },
		campaignId: { type: Schema.Types.ObjectId, ref: "Campaign" },
		linkId: String,
		metadata: Schema.Types.Mixed,
	},
	{ _id: false },
);

const metricsSchema = new Schema<IMetrics>(
	{
		opens: { type: Number, default: 0 },
		clicks: { type: Number, default: 0 },
		conversions: { type: Number, default: 0 },
		bounces: { type: Number, default: 0 },
		revenue: { type: Number, default: 0 },
		lastOpen: Date,
		lastClick: Date,
		interactions: [interactionSchema],
	},
	{ _id: false },
);

const subscriberSchema = new Schema<ISubscriber>(
	{
		formId: { type: Schema.Types.ObjectId, ref: "Form", required: true },
		userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
		data: { type: Schema.Types.Mixed, required: true },
		email: {
			type: String,
			required: true,
			lowercase: true,
			trim: true,
		},
		status: {
			type: String,
			enum: ["active", "unsubscribed", "bounced", "inactive"],
			default: "active",
		},
		tags: [String],
		lists: [{ type: Schema.Types.ObjectId, ref: "SubscriberList" }],
		lastInteraction: { type: Date, default: Date.now },
		engagementScore: { type: Number, default: 0 },
		metadata: {
			ip: String,
			userAgent: String,
			source: String,
			bounceReason: String,
			bounceDate: Date,
			inactivationReason: String,
			inactivationDate: Date,
		},
		metrics: {
			type: metricsSchema,
			default: () => ({
				opens: 0,
				clicks: 0,
				conversions: 0,
				bounces: 0,
				revenue: 0,
				interactions: [],
			}),
		},
	},
	{
		timestamps: true,
	},
);

subscriberSchema.index({ userId: 1, email: 1 }, { unique: true });
subscriberSchema.index({ status: 1 });
subscriberSchema.index({ lists: 1 });
subscriberSchema.index({ tags: 1 });
subscriberSchema.index({ lastInteraction: 1 });
subscriberSchema.index({ engagementScore: 1 });

export const Subscriber = mongoose.model<ISubscriber>(
	"Subscriber",
	subscriberSchema,
);
