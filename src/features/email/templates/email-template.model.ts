import mongoose, { Document, Schema } from "mongoose";

// Block-based template interfaces
export interface ITemplateBlock {
  id: string;
  type:
    | "header"
    | "text"
    | "button"
    | "footer"
    | "image"
    | "divider"
    | "column";
  content: Record<string, any>;
  styles: Record<string, any>;
}

export interface IColumn {
  id: string;
  blocks: ITemplateBlock[];
}

export interface ITemplateGlobalStyles {
  typography: {
    fontFamily: string;
    fontSize: string;
    lineHeight: string;
    letterSpacing: string;
  };
  colors: {
    text: string;
    background: string;
    border: string;
    link: string;
  };
  spacing: {
    padding: string;
    margin: string;
    gap: string;
    blockSpacing: string;
  };
  updatedAt: Date;
}

export interface ITemplateMetadata {
  blockCount: number;
  hasHeader: boolean;
  hasFooter: boolean;
  hasImages: boolean;
  hasButtons: boolean;
}

export interface IEmailTemplate extends Document {
  name: string;
  description?: string;
  blocks: ITemplateBlock[];
  globalStyles: ITemplateGlobalStyles;
  selectedStyle: string;
  version: string;
  status: "active" | "draft" | "archived";
  metadata: ITemplateMetadata;
  userId: string;
  createdAt: Date;
  updatedAt: Date;
}

const templateBlockSchema = new Schema<ITemplateBlock>();

templateBlockSchema.add({
  id: { type: String, required: true },
  type: {
    type: String,
    enum: ["header", "text", "button", "footer", "image", "divider", "column"],
    required: true,
  },
  content: {
    type: Schema.Types.Mixed,
    required: true,
    validate: {
      validator: function (this: ITemplateBlock, value: any) {
        if (this.type === "column") {
          return value.columns && Array.isArray(value.columns);
        }
        return true;
      },
      message: "Column type block must have a `columns` array in content.",
    },
  },
  styles: { type: Schema.Types.Mixed, required: true },
});

const templateGlobalStylesSchema = new Schema<ITemplateGlobalStyles>({
  typography: {
    fontFamily: { type: String, default: "Inter, sans-serif" },
    fontSize: { type: String, default: "16px" },
    lineHeight: { type: String, default: "1.5" },
    letterSpacing: { type: String, default: "normal" },
  },
  colors: {
    text: { type: String, default: "#000000" },
    background: { type: String, default: "#ffffff" },
    border: { type: String, default: "#e5e7eb" },
    link: { type: String, default: "#3b82f6" },
  },
  spacing: {
    padding: { type: String, default: "16px" },
    margin: { type: String, default: "0px" },
    gap: { type: String, default: "16px" },
    blockSpacing: { type: String, default: "24px" },
  },
  updatedAt: { type: Date, default: Date.now },
});

const templateMetadataSchema = new Schema<ITemplateMetadata>({
  blockCount: { type: Number, default: 0 },
  hasHeader: { type: Boolean, default: false },
  hasFooter: { type: Boolean, default: false },
  hasImages: { type: Boolean, default: false },
  hasButtons: { type: Boolean, default: false },
});

const emailTemplateSchema = new Schema<IEmailTemplate>(
  {
    name: { type: String, required: true },
    description: { type: String },
    blocks: [templateBlockSchema],
    globalStyles: { type: templateGlobalStylesSchema, required: true },
    selectedStyle: { type: String, default: "default" },
    version: { type: String, default: "1.0.0" },
    status: {
      type: String,
      enum: ["active", "draft", "archived"],
      default: "draft",
    },
    metadata: { type: templateMetadataSchema, required: true },
    userId: { type: String, required: true },
  },
  { timestamps: true }
);

emailTemplateSchema.index({ status: 1 });
emailTemplateSchema.index({ name: 1 });
emailTemplateSchema.index({ userId: 1 });
emailTemplateSchema.index({ "metadata.blockCount": 1 });

export const EmailTemplate = mongoose.model<IEmailTemplate>(
  "EmailTemplate",
  emailTemplateSchema
);
