import type { Prisma } from "@/lib/generated/prisma/client";

export type AuditFieldPolicy =
  | "boolean"
  | "date"
  | "number"
  | "scalar"
  | "string"
  | "url"
  | { readonly [key: string]: AuditFieldPolicy }
  | readonly [AuditFieldPolicy];

export type AuditPayloadPolicy = {
  after?: AuditFieldPolicy;
  before?: AuditFieldPolicy;
};

export const auditFields = {
  booleans: (...names: string[]) => fields(names, "boolean"),
  dates: (...names: string[]) => fields(names, "date"),
  numbers: (...names: string[]) => fields(names, "number"),
  scalars: (...names: string[]) => fields(names, "scalar"),
  strings: (...names: string[]) => fields(names, "string"),
  urls: (...names: string[]) => fields(names, "url"),
};

const omitted = Symbol("omitted-audit-field");
const redacted = "[redacted]";
const credentialBearingUrlPattern = /\b[a-z][a-z0-9+.-]*:\/\/[^\s/@]+@/i;

function fields(names: string[], policy: AuditFieldPolicy) {
  return Object.fromEntries(names.map((name) => [name, policy])) as Record<
    string,
    AuditFieldPolicy
  >;
}

function sanitizeString(value: string) {
  return credentialBearingUrlPattern.test(value) ? redacted : value;
}

function sanitizeUrl(value: string) {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return redacted;
    }
    parsed.username = "";
    parsed.password = "";
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return redacted;
  }
}

function sanitizeLeaf(value: unknown, policy: Exclude<AuditFieldPolicy, object>) {
  if (value === null) return null;
  if (policy === "boolean") return typeof value === "boolean" ? value : omitted;
  if (policy === "number") {
    if (typeof value === "number") return Number.isFinite(value) ? value : omitted;
    return typeof value === "bigint" ? value.toString() : omitted;
  }
  if (policy === "date") {
    if (value instanceof Date) return value.toISOString();
    return typeof value === "string" ? sanitizeString(value) : omitted;
  }
  if (policy === "url") {
    return typeof value === "string" ? sanitizeUrl(value) : omitted;
  }
  if (policy === "string") {
    return typeof value === "string" ? sanitizeString(value) : omitted;
  }
  if (typeof value === "string") return sanitizeString(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  return typeof value === "bigint" ? value.toString() : omitted;
}

function sanitizeDeclaredValue(
  value: unknown,
  policy: AuditFieldPolicy,
): Prisma.InputJsonValue | null | typeof omitted {
  if (value === null) return null;

  if (typeof policy === "string") {
    return sanitizeLeaf(value, policy);
  }

  if (Array.isArray(policy)) {
    if (!Array.isArray(value)) return omitted;
    return value.flatMap((item) => {
      const sanitized = sanitizeDeclaredValue(item, policy[0]);
      return sanitized === omitted ? [] : [sanitized];
    });
  }

  if (typeof value !== "object" || value instanceof Date || Array.isArray(value)) {
    return omitted;
  }

  const record = value as Record<string, unknown>;
  const entries = Object.entries(policy).flatMap(([key, childPolicy]) => {
    if (!Object.hasOwn(record, key)) return [];
    const sanitized = sanitizeDeclaredValue(record[key], childPolicy);
    return sanitized === omitted ? [] : [[key, sanitized] as const];
  });
  return Object.fromEntries(entries);
}

export function sanitizeDeclaredAuditPayload(
  value: unknown,
  policy: AuditFieldPolicy | undefined,
): Prisma.InputJsonValue | null | undefined {
  if (value === undefined || !policy) return undefined;
  const sanitized = sanitizeDeclaredValue(value, policy);
  return sanitized === omitted ? undefined : sanitized;
}
