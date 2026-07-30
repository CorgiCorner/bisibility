import { isIP } from "node:net";
import { domainToASCII } from "node:url";
import type { BacklinkTargetScope } from "@/lib/providers/types";

const RESERVED_SUFFIXES = new Set(["example", "invalid", "local", "localhost", "test"]);
const EXPLICIT_PROTOCOL = /^[a-z][a-z\d+.-]*:\/\//i;

export class UnsupportedBacklinksTargetError extends Error {
  readonly code = "unsupported_target";

  constructor(message = "The backlinks target is not supported.") {
    super(message);
    this.name = "UnsupportedBacklinksTargetError";
  }
}

function unsupported(message: string): never {
  throw new UnsupportedBacklinksTargetError(message);
}

function parseTarget(value: string) {
  const trimmed = value.trim();
  if (!trimmed) unsupported("The backlinks target is required.");
  const candidate = EXPLICIT_PROTOCOL.test(trimmed) ? trimmed : `https://${trimmed}`;
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return unsupported("The backlinks target must be a public domain or URL.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    unsupported("The backlinks target must use HTTP or HTTPS.");
  }
  if (url.username || url.password) {
    unsupported("The backlinks target cannot contain embedded credentials.");
  }
  return { explicitProtocol: EXPLICIT_PROTOCOL.test(trimmed), raw: trimmed, url };
}

function publicHostname(hostname: string) {
  const unwrapped = hostname.replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (isIP(unwrapped)) unsupported("IP address backlinks targets are not supported.");
  const ascii = domainToASCII(unwrapped).toLowerCase();
  const labels = ascii.split(".");
  const suffix = labels.at(-1) ?? "";
  const validLabel = (label: string) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label);
  const validSuffix = /^(?:[a-z]{2,63}|xn--[a-z0-9-]{2,59})$/i.test(suffix);
  if (
    !ascii ||
    labels.length < 2 ||
    labels.some((label) => !validLabel(label)) ||
    !validSuffix ||
    RESERVED_SUFFIXES.has(suffix)
  ) {
    unsupported("The backlinks target must have a valid public suffix.");
  }
  return ascii;
}

function normalizedPath(pathname: string) {
  if (!pathname || pathname === "/") return "/";
  return pathname.replace(/\/+$/, "") || "/";
}

export function normalizeBacklinksTarget(
  value: string,
  requestedScope?: BacklinkTargetScope,
): { scope: BacklinkTargetScope; target: string } {
  const parsed = parseTarget(value);
  const hostname = publicHostname(parsed.url.hostname);
  const meaningfulPath = parsed.url.pathname !== "" && parsed.url.pathname !== "/";
  const scope = requestedScope ?? (parsed.explicitProtocol || meaningfulPath ? "page" : "site");

  if (scope === "site") {
    return { scope, target: hostname.replace(/^www\./, "") };
  }
  if (
    parsed.raw.includes("?") ||
    parsed.raw.includes("#") ||
    parsed.url.search ||
    parsed.url.hash
  ) {
    unsupported("Page backlinks targets cannot contain a query string or fragment.");
  }
  const port = parsed.url.port ? `:${parsed.url.port}` : "";
  return {
    scope,
    target: `${parsed.url.protocol}//${hostname}${port}${normalizedPath(parsed.url.pathname)}`,
  };
}
