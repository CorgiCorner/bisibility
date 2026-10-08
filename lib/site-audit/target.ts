import { isBlockedWebhookAddress } from "@/lib/alerts/webhook-target";
import { parse } from "tldts";

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

export function auditRedirectUrl(value: string, base: URL, origin: string): URL | null {
  const sameOrigin = sameOriginAuditUrl(value, base, origin);
  if (sameOrigin) return sameOrigin;
  const project = new URL(origin);
  const hostname = project.hostname;
  const domain = parse(hostname, { allowPrivateDomains: true });
  const apex = domain.domain;
  if (!apex || (!domain.isIcann && !domain.isPrivate)) return null;
  if (hostname !== apex && hostname !== `www.${apex}`) return null;
  project.hostname = hostname === apex ? `www.${apex}` : apex;
  // Only the exact apex/www pair is eligible; scheme and port stay unchanged.
  return sameOriginAuditUrl(value, base, project.origin);
}
