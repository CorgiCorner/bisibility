import { isBlockedWebhookAddress } from "@/lib/alerts/webhook-target";

export function auditTarget(value: string) {
  const url = new URL(value.includes("://") ? value : `https://${value}`);
  const hostname = url.hostname.toLowerCase();
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    (url.port && !["80", "443"].includes(url.port)) ||
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    isBlockedWebhookAddress(hostname)
  ) {
    throw new Error("Site audit requires a public HTTP(S) project domain on a standard port.");
  }
  url.hash = "";
  url.search = "";
  return url;
}

export function sameOriginAuditUrl(value: string, base: URL, origin: string): URL | null {
  try {
    const url = new URL(value, base);
    if (url.origin !== origin || url.username || url.password || url.href.length > 1024)
      return null;
    if (!["http:", "https:"].includes(url.protocol)) return null;
    url.hash = "";
    // Query variants can create an unbounded crawl and trigger application mutations.
    if (url.search) return null;
    return url;
  } catch {
    return null;
  }
}
