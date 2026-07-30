import "@/lib/deployment/runtime-env.generated";

import { isIP } from "node:net";

const MAX_HEADER_LENGTH = 512;
const MAX_XFF_DEPTH = 10;
const APPENDING_HEADER = "x-forwarded-for";

export type HeaderReader = {
  get(name: string): string | null;
};

type ResolveOptions = {
  env?: Record<string, string | undefined>;
  warn?: (message: string) => void;
};

let warnedAboutMissingHeader = false;

export function resetClientIpWarningForTests() {
  warnedAboutMissingHeader = false;
}

export function normalizeIp(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const trimmed = value.replace(/^"|"$/g, "").trim();
  const bracketMatch = /^\[([^\]]+)](?::\d+)?$/.exec(trimmed);
  const candidate = bracketMatch?.[1] ?? trimmed;
  const withoutZone = candidate.split("%")[0] ?? candidate;

  if (isIP(withoutZone)) {
    return withoutZone;
  }

  const ipv4WithPort = /^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/.exec(withoutZone);
  if (ipv4WithPort?.[1] && isIP(ipv4WithPort[1]) === 4) {
    return ipv4WithPort[1];
  }

  return null;
}

function configuredHeader(env: Record<string, string | undefined>) {
  return env.BISIBILITY_CLIENT_IP_HEADER?.trim().toLowerCase() || null;
}

function trustedDepth(env: Record<string, string | undefined>) {
  const parsed = Number.parseInt(env.BISIBILITY_CLIENT_IP_XFF_DEPTH ?? "", 10);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= MAX_XFF_DEPTH ? parsed : 1;
}

function warnAboutMissingHeader(
  header: string,
  env: Record<string, string | undefined>,
  warn: (message: string) => void,
) {
  if (env.NODE_ENV !== "production" || warnedAboutMissingHeader) {
    return;
  }

  warnedAboutMissingHeader = true;
  warn(
    `[client-ip] BISIBILITY_CLIENT_IP_HEADER is set to "${header}" but the header is absent or unusable. Anonymous rate limiting falls back to a single shared bucket until the proxy sets it.`,
  );
}

// Count from the right: clients can prepend forwarded values but cannot move their
// address beyond entries appended by the trusted edge.
function candidateFrom(header: string, raw: string, depth: number) {
  const values = raw
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  if (!values.length) {
    return null;
  }

  if (header !== APPENDING_HEADER) {
    return values[0] ?? null;
  }

  return values[values.length - depth] ?? null;
}

export function resolveClientIp(headers: HeaderReader, options: ResolveOptions = {}) {
  const env = options.env ?? process.env;
  const header = configuredHeader(env);
  if (!header) {
    return null;
  }

  // Truncate from the right: the trusted entry sits at the end of an appending
  // header, so a long client-supplied prefix must not push it out of the cap.
  const raw = headers
    .get(header)
    ?.replace(/[\r\n]/g, "")
    .trim()
    .slice(-MAX_HEADER_LENGTH);
  const resolved = raw ? normalizeIp(candidateFrom(header, raw, trustedDepth(env))) : null;
  if (!resolved) {
    warnAboutMissingHeader(header, env, options.warn ?? console.warn);
  }

  return resolved;
}
