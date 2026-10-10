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

export function isAuditDocumentUrl(url: URL) {
  if (/^\/cdn-cgi\/l\/email-protection(?:\/|$)/.test(url.pathname)) return false;
  const segment = url.pathname.split("/").at(-1) ?? "";
  return !/\.(?:jpe?g|png|gif|webp|avif|svg|ico|bmp|tiff?|heic|woff2?|ttf|otf|eot|mp[34]|webm|mov|m4[av]|wav|ogg|flac|css|m?js|map|json|xml|csv|txt|md|pdf|zip|gz|tgz|rar|7z|dmg|exe|docx?|xlsx?|pptx?)$/i.test(
    segment,
  );
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
