import { Types } from "mongoose";

export type InteractionType = "open" | "click" | "conversion";

export interface IInteraction {
	type: InteractionType;
	timestamp: Date;
	offerId?: Types.ObjectId;
	offerCategories?: string[];
	campaignId?: Types.ObjectId;
	metadata?: Record<string, any>;
}

export interface InteractionWeight {
	[key in InteractionType]: number;
}
