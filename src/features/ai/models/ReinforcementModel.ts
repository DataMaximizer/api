import mongoose, { Document, Schema, Model } from "mongoose";

export interface IOfferWeight {
  id: string;
  weight: number;
}

export interface IWritingStyleWeight {
  style: string;
  weight: number;
}

export interface IAudienceSegmentWeight {
  segment: string;
  weight: number;
}

export interface IReinforcement extends Document {
  offerWeights: IOfferWeight[];
  writingStyleWeights: IWritingStyleWeight[];
  audienceSegmentWeights: IAudienceSegmentWeight[];
  lastUpdated: Date;
}

const ReinforcementSchema: Schema = new Schema({
  offerWeights: {
    type: [
      {
        id: { type: String, required: true },
        weight: { type: Number, required: true },
      },
    ],
    default: [],
  },
  writingStyleWeights: {
    type: [
      {
        style: { type: String, required: true },
        weight: { type: Number, required: true },
      },
    ],
    default: [],
  },
  audienceSegmentWeights: {
    type: [
      {
        segment: { type: String, required: true },
        weight: { type: Number, required: true },
      },
    ],
    default: [],
  },
  lastUpdated: {
    type: Date,
    default: Date.now,
  },
});

export const ReinforcementModel: Model<IReinforcement> =
  mongoose.model<IReinforcement>("ReinforcementModel", ReinforcementSchema);
