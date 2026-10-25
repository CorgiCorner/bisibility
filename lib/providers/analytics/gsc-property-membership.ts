import { normalizeGscProperty } from "./gsc-property";

export class GscPropertyUrlError extends Error {
  readonly code = "url_outside_property";
  constructor() {
    super(
      "URL must be a valid HTTP(S) URL within the project's connected Search Console property.",
    );
    this.name = "GscPropertyUrlError";
  }
}

function httpUrl(value: string) {
  try {
    const unsafe = [...value].some(
      (char) => char === "\\" || char.charCodeAt(0) <= 32 || char.charCodeAt(0) === 127,
    );
    if (unsafe || !/^https?:\/\/[^/]/i.test(value)) return null;
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password
      ? url
      : null;
  } catch {
    return null;
  }
}

export function gscPropertyContainsUrl(rawProperty: string, rawUrl: string): boolean {
  const property = normalizeGscProperty(rawProperty);
  const url = httpUrl(rawUrl);
  if (!url) return false;
  if (property.startsWith("sc-domain:")) {
    const domain = property.slice("sc-domain:".length);
    return Boolean(domain) && (url.hostname === domain || url.hostname.endsWith(`.${domain}`));
  }
  const prefix = httpUrl(property);
  return Boolean(prefix && url.origin === prefix.origin && url.href.startsWith(prefix.href));
}

export function assertGscPropertyUrl(property: string, url: string) {
  if (!gscPropertyContainsUrl(property, url)) throw new GscPropertyUrlError();
}

// Listing has no URL input; validate the root represented by the stored property.
export function assertGscProperty(property: string) {
  const normalized = normalizeGscProperty(property);
  const root = normalized.startsWith("sc-domain:")
    ? `https://${normalized.slice("sc-domain:".length)}/`
    : normalized;
  assertGscPropertyUrl(normalized, root);
}
