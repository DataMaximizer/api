import mongoose, { Document, Schema } from "mongoose";

export enum CampaignType {
	EMAIL = "email",
	SMS = "sms",
}

export enum CampaignStatus {
	DRAFT = "draft",
	SCHEDULED = "scheduled",
	RUNNING = "running",
	COMPLETED = "completed",
	PAUSED = "paused",
}

export interface ICampaignVariant extends Document {
	subject?: string;
	content: string;
	tone: string;
	personality: string;
	writingStyle: string;
	metrics: {
		opens: number;
		clicks: number;
		conversions: number;
		revenue: number;
	};
}

export interface ICampaign extends Document {
	name: string;
	type: CampaignType;
	status: CampaignStatus;
	userId: Schema.Types.ObjectId;
	segments: Schema.Types.ObjectId[];
	variants: ICampaignVariant[];
	schedule?: {
		startDate: Date;
		endDate?: Date;
		sendTime?: string;
	};
	settings: {
		fromName: string;
		fromEmail?: string;
		fromPhone?: string;
		replyTo?: string;
		customPrompts?: string[];
	};
	metrics: {
		totalSent: number;
		totalOpens: number;
		totalClicks: number;
		totalConversions: number;
		totalRevenue: number;
		winningVariantId?: Schema.Types.ObjectId;
	};
	smtpProviderId: Schema.Types.ObjectId;
	createdAt: Date;
	updatedAt: Date;
}

const campaignVariantSchema = new Schema<ICampaignVariant>({
	subject: String,
	content: { type: String, required: true },
	tone: { type: String, required: true },
	personality: { type: String, required: true },
	writingStyle: { type: String, required: true },
	metrics: {
		opens: { type: Number, default: 0 },
		clicks: { type: Number, default: 0 },
		conversions: { type: Number, default: 0 },
		revenue: { type: Number, default: 0 },
	},
});

const campaignSchema = new Schema<ICampaign>(
	{
		name: { type: String, required: true },
		type: {
			type: String,
			enum: Object.values(CampaignType),
			required: true,
		},
		status: {
			type: String,
			enum: Object.values(CampaignStatus),
			default: CampaignStatus.DRAFT,
		},
		userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
		segments: [{ type: Schema.Types.ObjectId, ref: "Segment" }],
		variants: [campaignVariantSchema],
		schedule: {
			startDate: Date,
			endDate: Date,
			sendTime: String,
		},
		settings: {
			fromName: { type: String, required: true },
			fromEmail: String,
			fromPhone: String,
			replyTo: String,
			customPrompts: [String],
		},
		metrics: {
			totalSent: { type: Number, default: 0 },
			totalOpens: { type: Number, default: 0 },
			totalClicks: { type: Number, default: 0 },
			totalConversions: { type: Number, default: 0 },
			totalRevenue: { type: Number, default: 0 },
			winningVariantId: Schema.Types.ObjectId,
		},
		smtpProviderId: {
			type: Schema.Types.ObjectId,
			ref: "SmtpProvider",
			required: true,
		},
	},
	{ timestamps: true },
);

export const Campaign = mongoose.model<ICampaign>("Campaign", campaignSchema);
