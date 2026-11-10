import { normalizeDomain } from "@/lib/domains/normalize";

const GOOGLE_HOST = /^google\.(?:[a-z]{2,3}|[a-z]{2,3}\.[a-z]{2})$/;

function googleSearchHost(hostname: string) {
  const host = normalizeDomain(hostname);
  return host !== null && GOOGLE_HOST.test(host);
}

function gotoPath(pathname: string) {
  return pathname === "/goto" || pathname === "/goto/";
}

function urlQuery(url: URL) {
  return (url.pathname === "/url" || url.pathname === "/url/") && url.searchParams.has("q");
}

function googleRedirectParts(url: URL) {
  return googleSearchHost(url.hostname) && (gotoPath(url.pathname) || urlQuery(url));
}

/**
 * Google intermediary forms: absolute http(s) google.<tld> /goto or /url?q=,
 * protocol-relative //host/goto and //goto, and relative /goto or /url?q=.
 */
export function isGoogleRedirectUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith("//")) return protocolRelativeRedirect(trimmed);
  if (trimmed.startsWith("/")) return relativeRedirect(trimmed);
  if (/^https?:\/\//i.test(trimmed)) return absoluteRedirect(trimmed);
  return false;
}

function protocolRelativeRedirect(value: string) {
  if (/^\/\/goto(?:\/|\?|#|$)/i.test(value)) return true;
  try {
    return googleRedirectParts(new URL(`https:${value}`));
  } catch {
    return false;
  }
}

function relativeRedirect(value: string) {
  try {
    const url = new URL(value, "https://www.google.com");
    return gotoPath(url.pathname) || urlQuery(url);
  } catch {
    return false;
  }
}

function absoluteRedirect(value: string) {
  try {
    const url = new URL(value);
    return (url.protocol === "http:" || url.protocol === "https:") && googleRedirectParts(url);
  } catch {
    return false;
  }
}

/** Absolute https google.com /goto links are the only form the converter accepts. */
export function isResolvableRedirect(value: unknown): value is string {
  if (typeof value !== "string" || !isGoogleRedirectUrl(value)) return false;
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      (url.hostname === "google.com" || url.hostname === "www.google.com") &&
      (url.pathname === "/goto" || url.pathname === "/goto/")
    );
  } catch {
    return false;
  }
}
