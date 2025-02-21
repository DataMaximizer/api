import { IAddress } from "@/features/user/models/user.model";
import { v4 as uuidv4 } from "uuid";

export class EmailTemplateService {
  private static readonly BASE_URL =
    process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";
  private static readonly FRONTEND_URL =
    process.env.FRONTEND_URL || "http://localhost:3000";

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

  static generateTrackingLink(originalUrl: string, clickId: string): string {
    return `${
      this.BASE_URL
    }/api/metrics/track/redirect?url=${encodeURIComponent(
      originalUrl
    )}&clickId=${clickId}`;
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
    const trackingPixel = this.generateTrackingPixel(subscriberId, campaignId);

    let contentWithTrackedLinks = content.replace(
      /<a\s+href=(['"])([^'"]+)\1([^>]*)>/g,
      (match, quote, url, rest) => {
        const trackedUrl = this.generateTrackingLink(url, clickId);
        return `<a href=${quote}${trackedUrl}${quote}${rest}>`;
      }
    );

    contentWithTrackedLinks += trackingPixel;

    return contentWithTrackedLinks;
  }

  static addUnsubscribeToTemplate(
    content: string,
    clickId: string,
    websiteUrl: string,
    address: IAddress,
    companyName: string
  ): string {
    const unsubscribeLink = this.generateUnsubscribeLink(clickId, websiteUrl);
    const unsubscribeText = `
      <br />
      <br />
      <br />
      <br />
      <div style="text-align: center;">
        <p style="font-size: 12px; color: #666;margin:0;">${companyName}</p>
        <p style="font-size: 12px; color: #666;margin:0;">${address.line1}</p>
        <p style="font-size: 12px; color: #666;margin:0;">${address.city}, ${address.state} - ${address.postalCode}</p>
        <p style="font-size: 12px; color: #666;margin:0;">If you no longer wish to receive these emails, you can unsubscribe by clicking <a href="${unsubscribeLink}">here</a>.</p>
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
}
