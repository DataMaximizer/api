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
  features?: string[];
  pricing?: string;
  targetAudience?: string;
  uniqueSellingPoints?: string[];
  suggestedCategories?: string[];
  marketingHighlights?: string[];
  technicalDetails?: Record<string, any>;
}

export interface IOfferParameter {
  type: string;
  name: string;
  placeholder: string;
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
  parameters: IOfferParameter[];
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
    features: [String],
    pricing: String,
    targetAudience: String,
    uniqueSellingPoints: [String],
    suggestedCategories: [String],
    marketingHighlights: [String],
    technicalDetails: Schema.Types.Mixed,
  },
  { _id: false }
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
    parameters: [
      {
        type: { type: String, required: true },
        name: { type: String, required: true },
        placeholder: { type: String, required: true },
      },
    ],
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    isAdminOffer: { type: Boolean, default: false },
    userCommissionRate: Number,
    lastChecked: Date,
    lastActive: Date,
    metadata: Schema.Types.Mixed,
  },
  {
    timestamps: true,
  }
);

offerSchema.index({ status: 1 });
offerSchema.index({ categories: 1 });
offerSchema.index({ tags: 1 });
offerSchema.index({ userId: 1 });
offerSchema.index({ "productInfo.suggestedCategories": 1 });
offerSchema.index({ createdAt: -1 });
offerSchema.index({
  name: "text",
  description: "text",
  "productInfo.description": "text",
});

offerSchema.pre("save", function (next) {
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

  if (this.isModified("status") && this.status === OfferStatus.ACTIVE) {
    this.lastActive = new Date();
  }

  next();
});

offerSchema.virtual("searchableContent").get(function () {
  return `${this.name} ${this.description} ${
    this.productInfo?.description || ""
  } ${this.productInfo?.benefits?.join(" ") || ""} ${
    this.productInfo?.features?.join(" ") || ""
  }`.toLowerCase();
});

export const AffiliateOffer = mongoose.model<IAffiliateOffer>(
  "AffiliateOffer",
  offerSchema
);
