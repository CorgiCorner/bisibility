import { Buffer } from "node:buffer";

const MAX_DIAGNOSTIC_VALUE_LENGTH = 256;
const MAX_AUDIENCES = 4;
const MAX_ENCODED_PAYLOAD_LENGTH = 8_192;
const MAX_DEDUPLICATION_KEYS = 32;
const LOG_DEDUPLICATION_WINDOW_MS = 60_000;

const lastLoggedAt = new Map<string, number>();

type ErrorMetadata = {
  claim?: string;
  code?: string;
  name: string;
  reason?: string;
};

type ObservedClaims = {
  audience: string | string[] | null;
  audienceTruncated?: boolean;
  issuer: string | null;
};

type TokenInspection = {
  observed: ObservedClaims;
  tokenFormat: "jwt" | "malformed_jwt" | "opaque";
};

function boundedString(value: unknown) {
  if (typeof value !== "string") return undefined;
  const sanitized = Array.from(value, (character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint < 32 || codePoint === 127 ? " " : character;
  })
    .join("")
    .trim();
  return sanitized ? sanitized.slice(0, MAX_DIAGNOSTIC_VALUE_LENGTH) : undefined;
}

function protocolIdentifier(value: unknown) {
  const candidate = boundedString(value);
  if (!candidate) return null;

  try {
    const url = new URL(candidate);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return null;
    if (!url.search && !url.hash) return candidate;
    url.search = "";
    url.hash = "";
    return boundedString(url.toString()) ?? null;
  } catch {
    return null;
  }
}

function audienceClaim(value: unknown) {
  if (value === undefined) return { audience: null };
  if (typeof value === "string") return { audience: protocolIdentifier(value) };
  if (!Array.isArray(value)) return { audience: null };

  const audiences = value
    .map(protocolIdentifier)
    .filter((audience): audience is string => audience !== null);
  return {
    audience: audiences.length > 0 ? audiences.slice(0, MAX_AUDIENCES) : null,
    ...(audiences.length > MAX_AUDIENCES ? { audienceTruncated: true } : {}),
  };
}

function inspectToken(token: string): TokenInspection {
  const segments = token.split(".", 4);
  if (segments.length !== 3) {
    return { observed: { audience: null, issuer: null }, tokenFormat: "opaque" };
  }

  const [, encodedPayload, signature] = segments;
  if (!encodedPayload || encodedPayload.length > MAX_ENCODED_PAYLOAD_LENGTH || !signature) {
    return { observed: { audience: null, issuer: null }, tokenFormat: "malformed_jwt" };
  }

  try {
    const parsed = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { observed: { audience: null, issuer: null }, tokenFormat: "malformed_jwt" };
    }
    const claims = parsed as Record<string, unknown>;
    return {
      observed: {
        ...audienceClaim(claims.aud),
        issuer: protocolIdentifier(claims.iss),
      },
      tokenFormat: "jwt",
    };
  } catch {
    return { observed: { audience: null, issuer: null }, tokenFormat: "malformed_jwt" };
  }
}

function errorMetadata(error: unknown): ErrorMetadata {
  const record = error && typeof error === "object" ? (error as Record<string, unknown>) : {};
  const claim = boundedString(record.claim);
  const code = boundedString(record.code);
  const reason = boundedString(record.reason);
  return {
    ...(claim ? { claim } : {}),
    ...(code ? { code } : {}),
    name: boundedString(record.name) ?? "UnknownError",
    ...(reason ? { reason } : {}),
  };
}

function shouldLog(error: ErrorMetadata, tokenFormat: TokenInspection["tokenFormat"]) {
  const now = Date.now();
  const key = [tokenFormat, error.name, error.code, error.claim, error.reason].join("|");
  const previous = lastLoggedAt.get(key);
  if (previous !== undefined && now - previous < LOG_DEDUPLICATION_WINDOW_MS) return false;

  for (const [existingKey, loggedAt] of lastLoggedAt) {
    if (now - loggedAt >= LOG_DEDUPLICATION_WINDOW_MS) lastLoggedAt.delete(existingKey);
  }
  if (!lastLoggedAt.has(key) && lastLoggedAt.size >= MAX_DEDUPLICATION_KEYS) return false;

  lastLoggedAt.set(key, now);
  return true;
}

export function logOauthValidationFailure(
  token: string,
  error: unknown,
  expected: { audience: string; issuer: string },
) {
  const inspected = inspectToken(token);
  const safeError = errorMetadata(error);
  if (!shouldLog(safeError, inspected.tokenFormat)) return;

  console.warn("[mcp-oauth] access token verification failed", {
    error: safeError,
    expected: {
      audience: protocolIdentifier(expected.audience),
      issuer: protocolIdentifier(expected.issuer),
    },
    ...inspected,
  });
}
