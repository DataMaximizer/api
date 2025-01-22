/**
 * Validates if a string is a properly formatted URL with allowed protocols
 * @param urlString - The URL string to validate
 * @returns boolean indicating if URL is valid
 */
export function isValidUrl(urlString: string): boolean {
  try {
    const url = new URL(urlString);
    // Allow only http and https protocols
    const allowedProtocols = ["http:", "https:"];
    return allowedProtocols.includes(url.protocol);
  } catch {
    return false;
  }
}
