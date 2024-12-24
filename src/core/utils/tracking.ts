export const generateTrackingPixel = (
	subscriberId: string,
	campaignId?: string,
) => {
	const baseUrl = process.env.NEXT_PUBLIC_API_URL;
	return `${baseUrl}/api/metrics/track/pixel/${subscriberId}?campaignId=${campaignId || ""}`;
};

export const generateTrackingLink = (
	originalUrl: string,
	subscriberId: string,
	linkId: string,
	campaignId?: string,
) => {
	const baseUrl = process.env.NEXT_PUBLIC_API_URL;
	return `${baseUrl}/api/metrics/track/redirect?url=${encodeURIComponent(originalUrl)}&subscriberId=${subscriberId}&linkId=${linkId}&campaignId=${campaignId || ""}`;
};
