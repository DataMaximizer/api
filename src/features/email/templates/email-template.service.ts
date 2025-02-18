import { v4 as uuidv4 } from "uuid";

export class EmailTemplateService {
  private static readonly BASE_URL =
    process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

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
