import { IAddress } from "@/features/user/models/user.model";
import {
  EmailTemplate,
  ITemplateBlock,
  ITemplateMetadata,
} from "./email-template.model";
import { logger } from "@config/logger";

export class EmailTemplateService {
  private static readonly BASE_URL =
    process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";
  private static readonly FRONTEND_URL =
    process.env.FRONTEND_URL || "http://localhost:3000";
  private static readonly REDIRECT_URL =
    process.env.REDIRECT_URL || "http://localhost:5002";

  static generateTrackingPixel(
    subscriberId: string,
    campaignId?: string
  ): string {
    return `<img src="${
      this.BASE_URL
    }/api/metrics/track/pixel/${subscriberId}?campaignId=${
      campaignId || ""
    }" width="1" height="1" style="display:none;" alt="" />`;
  }

  static generateTrackingLink(clickId: string, originalUrl: string): string {
    const encodedUrl = encodeURIComponent(originalUrl);
    return `${this.REDIRECT_URL}/api/redirect?clickId=${clickId}&url=${encodedUrl}`;
  }

  static generateUnsubscribeLink(clickId: string, websiteUrl: string): string {
    return `${this.BASE_URL}/api/subscribers/unsubscribe?clickId=${clickId}&websiteUrl=${websiteUrl}`;
  }

  static addTrackingToTemplate(
    content: string,
    subscriberId: string,
    campaignId: string,
    clickId: string
  ): string {
    let contentWithTrackedLinks = content.replace(
      /(<a\s+[^>]*?href=)(['"])([^'"]+)\2/g,
      (match, before, quote, url) => {
        const trackedUrl = this.generateTrackingLink(clickId, url);
        return `${before}${quote}${trackedUrl}${quote}`;
      }
    );

    contentWithTrackedLinks += this.generateTrackingPixel(
      subscriberId,
      campaignId
    );

    return contentWithTrackedLinks;
  }

  static addUnsubscribeToTemplate(
    content: string,
    clickId: string,
    websiteUrl: string,
    address: IAddress,
    companyName: string
  ): string {
    let unsubscribeLink = "";
    if (websiteUrl) {
      unsubscribeLink = this.generateUnsubscribeLink(clickId, websiteUrl);
    }

    const unsubscribeText = `
      <br />
      <br />
      <br />
      <br />
      <div style="text-align: center;">
        <p style="font-size: 12px; color: #666;margin:0;">${companyName}</p>
        <p style="font-size: 12px; color: #666;margin:0;">${address.line1}</p>
        <p style="font-size: 12px; color: #666;margin:0;">${address.city}, ${
      address.state
    } - ${address.postalCode}</p>
        ${
          unsubscribeLink
            ? `<p style="font-size: 12px; color: #666;margin:0;">If you no longer wish to receive these emails, you can unsubscribe by clicking <a href="${unsubscribeLink}">here</a>.</p>`
            : ""
        }
      </div>
    `;
    return content + unsubscribeText;
  }

  static createEmailTemplate(
    template: string,
    data: Record<string, any>
  ): string {
    let compiledTemplate = template;
    Object.entries(data).forEach(([key, value]) => {
      compiledTemplate = compiledTemplate.replace(
        new RegExp(`{{${key}}}`, "g"),
        String(value)
      );
    });
    return compiledTemplate;
  }

  // Calculate template metadata based on blocks
  static calculateMetadata(blocks: ITemplateBlock[]): ITemplateMetadata {
    const metadata: ITemplateMetadata = {
      blockCount: blocks.length,
      hasHeader: false,
      hasFooter: false,
      hasImages: false,
      hasButtons: false,
    };

    blocks.forEach((block) => {
      switch (block.type) {
        case "header":
          metadata.hasHeader = true;
          break;
        case "footer":
          metadata.hasFooter = true;
          break;
        case "image":
          metadata.hasImages = true;
          break;
        case "button":
          metadata.hasButtons = true;
          break;
      }
    });

    return metadata;
  }

  // Get all templates with filtering by userId
  static async getAllTemplates(userId: string, status?: string) {
    try {
      const query: any = { userId };
      if (status) {
        query.status = status;
      }

      const templates = await EmailTemplate.find(query).lean();

      return templates;
    } catch (error) {
      logger.error("Error fetching email templates:", error);
      throw new Error("Failed to fetch email templates");
    }
  }

  // Get single template by ID and userId
  static async getTemplateById(id: string, userId: string) {
    try {
      const template = await EmailTemplate.findOne({ _id: id, userId }).lean();

      if (!template) {
        return {
          success: false,
          error: "Template not found",
          statusCode: 404,
        };
      }

      return template;
    } catch (error) {
      logger.error("Error fetching email template:", error);
      throw new Error("Failed to fetch email template");
    }
  }

  // Create new template
  static async createTemplate(templateData: any, userId: string) {
    try {
      // Calculate metadata
      const metadata = this.calculateMetadata(templateData.blocks || []);

      const template = new EmailTemplate({
        ...templateData,
        userId,
        metadata,
      });

      const savedTemplate = await template.save();

      return {
        success: true,
        data: savedTemplate,
      };
    } catch (error) {
      logger.error("Error creating email template:", error);
      throw new Error("Failed to create email template");
    }
  }

  // Update template
  static async updateTemplate(id: string, updateData: any, userId: string) {
    try {
      // Calculate new metadata if blocks are being updated
      if (updateData.blocks) {
        updateData.metadata = this.calculateMetadata(updateData.blocks);
      }

      const template = await EmailTemplate.findOneAndUpdate(
        { _id: id, userId },
        { ...updateData, updatedAt: new Date() },
        { new: true }
      );

      if (!template) {
        return {
          success: false,
          error: "Template not found",
          statusCode: 404,
        };
      }

      return {
        success: true,
        data: template,
      };
    } catch (error) {
      logger.error("Error updating email template:", error);
      throw new Error("Failed to update email template");
    }
  }

  // Delete template
  static async deleteTemplate(id: string, userId: string) {
    try {
      const template = await EmailTemplate.findOneAndDelete({
        _id: id,
        userId,
      });

      if (!template) {
        return {
          success: false,
          error: "Template not found",
          statusCode: 404,
        };
      }

      return {
        success: true,
        message: "Template deleted successfully",
      };
    } catch (error) {
      logger.error("Error deleting email template:", error);
      throw new Error("Failed to delete email template");
    }
  }
}
