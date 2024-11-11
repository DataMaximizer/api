import mongoose, { Document, Schema } from "mongoose";

export enum TestStatus {
	DRAFT = "draft",
	RUNNING = "running",
	COMPLETED = "completed",
	PAUSED = "paused",
}

export enum TestType {
	SUBJECT = "subject",
	CONTENT = "content",
	SEND_TIME = "send_time",
	OFFER = "offer",
}

export interface ITestVariant extends Document {
	name: string;
	content: string;
	metrics: {
		sent: number;
		opens: number;
		clicks: number;
		conversions: number;
		revenue: number;
	};
	metadata?: Record<string, any>;
}

export interface IAbTest extends Document {
	name: string;
	campaignId: Schema.Types.ObjectId;
	type: TestType;
	status: TestStatus;
	variants: ITestVariant[];
	winningVariantId?: Schema.Types.ObjectId;
	winningCriteria: {
		metric: string;
		minConfidence: number;
		minSampleSize: number;
	};
	settings: {
		trafficAllocation: number;
		testDuration: number;
	};
	metrics: {
		totalParticipants: number;
		completionDate?: Date;
		confidence?: number;
	};
	userId: Schema.Types.ObjectId;
}

const testVariantSchema = new Schema<ITestVariant>(
	{
		name: { type: String, required: true },
		content: { type: String, required: true },
		metrics: {
			sent: { type: Number, default: 0 },
			opens: { type: Number, default: 0 },
			clicks: { type: Number, default: 0 },
			conversions: { type: Number, default: 0 },
			revenue: { type: Number, default: 0 },
		},
		metadata: Schema.Types.Mixed,
	},
	{ timestamps: true },
);

const abTestSchema = new Schema<IAbTest>(
	{
		name: { type: String, required: true },
		campaignId: {
			type: Schema.Types.ObjectId,
			ref: "Campaign",
			required: true,
		},
		type: {
			type: String,
			enum: Object.values(TestType),
			required: true,
		},
		status: {
			type: String,
			enum: Object.values(TestStatus),
			default: TestStatus.DRAFT,
		},
		variants: [testVariantSchema],
		winningVariantId: { type: Schema.Types.ObjectId },
		winningCriteria: {
			metric: {
				type: String,
				enum: ["opens", "clicks", "conversions", "revenue"],
				required: true,
			},
			minConfidence: { type: Number, default: 95 },
			minSampleSize: { type: Number, default: 1000 },
		},
		settings: {
			trafficAllocation: { type: Number, default: 100 },
			testDuration: { type: Number, required: true }, // in hours
		},
		metrics: {
			totalParticipants: { type: Number, default: 0 },
			completionDate: Date,
			confidence: Number,
		},
		userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
	},
	{ timestamps: true },
);

abTestSchema.index({ userId: 1, status: 1 });
abTestSchema.index({ campaignId: 1, type: 1 });

export const AbTest = mongoose.model<IAbTest>("AbTest", abTestSchema);
