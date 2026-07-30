export const defaultCanonicalOrigin = "https://bisibility.com";

type HeaderReader = Pick<Headers, "get">;
export type OriginEnv = Readonly<{
  NODE_ENV?: string;
  SITE_URL?: string;
  TRUST_REQUEST_ORIGIN?: string;
}>;

export type CanonicalOriginOptions = {
  env?: OriginEnv;
  requestOrigin?: string | null;
  warn?: (message: string) => void;
};

let warnedAboutMissingSiteUrl = false;

export function normalizeOrigin(candidate: string | null | undefined) {
  if (!candidate) {
    return null;
  }

  try {
    return new URL(candidate).origin;
  } catch {
    return null;
  }
}

function firstHeaderValue(value: string | null) {
  return value?.split(",")[0]?.trim() || null;
}

function hostFromHeader(value: string | null) {
  const rawHost = firstHeaderValue(value);
  if (!rawHost) {
    return null;
  }

  try {
    return rawHost.includes("://") ? new URL(rawHost).host : rawHost.split("/")[0];
  } catch {
    return null;
  }
}

function protocolForHost(headers: HeaderReader, host: string) {
  const forwardedProto = firstHeaderValue(headers.get("x-forwarded-proto"));
  if (forwardedProto === "http" || forwardedProto === "https") {
    return forwardedProto;
  }

  return host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https";
}

function warnAboutFallback(options: CanonicalOriginOptions, fallback: string) {
  const env = options.env ?? process.env;
  if (env.NODE_ENV !== "production" || warnedAboutMissingSiteUrl) {
    return;
  }

  warnedAboutMissingSiteUrl = true;
  const warn = options.warn ?? console.warn;
  const message = `[canonical-origin] SITE_URL is missing or invalid; falling back to ${fallback}. Set SITE_URL to the deployment's public origin for correct canonical URLs.`;
  warn(message);
}

export function getRequestOriginFromHeaders(headers: HeaderReader) {
  const host =
    hostFromHeader(headers.get("x-forwarded-host")) ?? hostFromHeader(headers.get("host"));
  if (!host) {
    return null;
  }

  return normalizeOrigin(`${protocolForHost(headers, host)}://${host}`);
}

export function getRequestOriginFromRequest(request: Request) {
  return getRequestOriginFromHeaders(request.headers);
}

export function resolveCanonicalOrigin(options: CanonicalOriginOptions = {}) {
  const env = options.env ?? process.env;
  const configuredOrigin = normalizeOrigin(env.SITE_URL);
  if (configuredOrigin) {
    return configuredOrigin;
  }

  // Production trusts request origins only with explicit opt-in because forwarded
  // host headers are attacker-controlled without a sanitizing proxy.
  const requestOrigin = normalizeOrigin(options.requestOrigin);
  const trustsRequestOrigin = env.NODE_ENV !== "production" || env.TRUST_REQUEST_ORIGIN === "true";
  if (requestOrigin && trustsRequestOrigin) {
    warnAboutFallback(options, "the request origin");
    return requestOrigin;
  }

  warnAboutFallback(options, defaultCanonicalOrigin);
  return defaultCanonicalOrigin;
}

export function resolveCanonicalOriginFromHeaders(
  headers: HeaderReader,
  options: Omit<CanonicalOriginOptions, "requestOrigin"> = {},
) {
  return resolveCanonicalOrigin({
    ...options,
    requestOrigin: getRequestOriginFromHeaders(headers),
  });
}

export function resolveCanonicalOriginFromRequest(
  request: Request,
  options: Omit<CanonicalOriginOptions, "requestOrigin"> = {},
) {
  return resolveCanonicalOrigin({
    ...options,
    requestOrigin: getRequestOriginFromRequest(request),
  });
}

export function absoluteUrl(origin: string, path: string) {
  return new URL(path, `${normalizeOrigin(origin) ?? defaultCanonicalOrigin}/`).toString();
}
