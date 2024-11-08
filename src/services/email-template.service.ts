import { v4 as uuidv4 } from "uuid";

export class EmailTemplateService {
	private static readonly BASE_URL =
		process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

	static generateTrackingPixel(
		subscriberId: string,
		campaignId?: string,
	): string {
		return `<img src="${this.BASE_URL}/api/metrics/track/pixel/${subscriberId}?campaignId=${campaignId || ""}" width="1" height="1" style="display:none;" alt="" />`;
	}

	static generateTrackingLink(
		originalUrl: string,
		subscriberId: string,
		campaignId?: string,
	): string {
		const linkId = uuidv4();
		return `${this.BASE_URL}/api/metrics/track/redirect?url=${encodeURIComponent(originalUrl)}&subscriberId=${subscriberId}&linkId=${linkId}&campaignId=${campaignId || ""}`;
	}

	static addTrackingToTemplate(
		content: string,
		subscriberId: string,
		campaignId?: string,
	): string {
		// Add tracking pixel
		const trackingPixel = this.generateTrackingPixel(subscriberId, campaignId);

		// Replace links with tracking links
		const contentWithTrackedLinks = content.replace(
			/<a\s+href="([^"]+)"([^>]*)>/g,
			(match, url, rest) => {
				const trackedUrl = this.generateTrackingLink(
					url,
					subscriberId,
					campaignId,
				);
				return `<a href="${trackedUrl}"${rest}>`;
			},
		);

		// Add tracking pixel at the end of the email body
		return contentWithTrackedLinks.replace(
			"</body>",
			`${trackingPixel}</body>`,
		);
	}

	static createEmailTemplate(
		template: string,
		data: Record<string, any>,
	): string {
		// Replace variables in template
		let compiledTemplate = template;
		Object.entries(data).forEach(([key, value]) => {
			compiledTemplate = compiledTemplate.replace(
				new RegExp(`{{${key}}}`, "g"),
				String(value),
			);
		});
		return compiledTemplate;
	}
}
