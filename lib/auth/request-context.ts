import "server-only";

import { createHmac, randomUUID } from "node:crypto";
import { isIP } from "node:net";
import { type HeaderReader, normalizeIp, resolveClientIp } from "@/lib/http/client-ip";
import packageJson from "@/package.json";
import { headers } from "next/headers";

const MAX_APP_VERSION_LENGTH = 128;
const MAX_CORRELATION_ID_LENGTH = 128;
const MAX_USER_AGENT_LENGTH = 512;

export type AuditRequestContext = {
  appVersion: string;
  correlationId: string;
  sourceIpHash: string | null;
  sourceIpMasked: string | null;
  userAgent: string | null;
};

function cleanHeader(value: string | null, maxLength: number) {
  const cleaned = value?.replace(/[\r\n]/g, "").trim();
  return cleaned ? cleaned.slice(0, maxLength) : null;
}

function appVersion() {
  return (
    cleanHeader(process.env.APP_VERSION ?? packageJson.version, MAX_APP_VERSION_LENGTH) ??
    packageJson.version
  );
}

function expandIpv6(address: string) {
  const lower = address.toLowerCase();
  if (isIP(lower) !== 6 || lower.includes(".")) {
    return null;
  }

  const [head = "", tail = ""] = lower.split("::");
  const headParts = head ? head.split(":") : [];
  const tailParts = tail ? tail.split(":") : [];
  const missing = 8 - headParts.length - tailParts.length;

  if (missing < 0) {
    return null;
  }

  return [...headParts, ...Array.from({ length: missing }, () => "0"), ...tailParts].map((part) =>
    Number.parseInt(part || "0", 16).toString(16),
  );
}

export function maskIpAddress(value: string | null | undefined) {
  const ip = normalizeIp(value ?? null);
  if (!ip) {
    return null;
  }

  const version = isIP(ip);

  if (version === 4) {
    const [a, b, c] = ip.split(".");
    return `${a}.${b}.${c}.0`;
  }

  if (version === 6) {
    const parts = expandIpv6(ip);
    return parts ? `${parts[0]}:${parts[1]}:${parts[2]}::` : null;
  }

  return null;
}

export function hashIpAddress(value: string | null | undefined, secret?: string) {
  const ip = normalizeIp(value ?? null);
  const key = secret ?? process.env.AUDIT_IP_HMAC_SECRET;

  if (!ip || !key) {
    return null;
  }

  return createHmac("sha256", key).update(ip).digest("hex");
}

export function auditRequestContextFromHeaders(headerList: HeaderReader): AuditRequestContext {
  const ip = resolveClientIp(headerList);
  const correlationId =
    cleanHeader(headerList.get("x-correlation-id"), MAX_CORRELATION_ID_LENGTH) ?? randomUUID();

  return {
    appVersion: appVersion(),
    correlationId,
    sourceIpHash: hashIpAddress(ip),
    sourceIpMasked: maskIpAddress(ip),
    userAgent: cleanHeader(headerList.get("user-agent"), MAX_USER_AGENT_LENGTH),
  };
}

export function fallbackAuditRequestContext(): AuditRequestContext {
  return {
    appVersion: appVersion(),
    correlationId: randomUUID(),
    sourceIpHash: null,
    sourceIpMasked: null,
    userAgent: null,
  };
}

export async function getAuditRequestContext(): Promise<AuditRequestContext> {
  return auditRequestContextFromHeaders(await headers());
}
