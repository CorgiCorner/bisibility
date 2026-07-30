import { auditTargetPolicy } from "@/lib/audit/target-policy";
import { type PublicIdPrefix, parsePublicId } from "@/lib/db/public-id";

function isIdentifierField(field: string | undefined) {
  return Boolean(
    field &&
      (field === "id" ||
        field.endsWith("_id") ||
        field.endsWith("_ids") ||
        /Id(?:s)?$/.test(field)),
  );
}

export function requiredPublicId(
  value: string | null,
  resource: string,
  expectedPrefix: PublicIdPrefix,
) {
  if (!value || parsePublicId(value)?.prefix !== expectedPrefix) {
    throw new Error(`${resource} public ID is not available.`);
  }
  return value;
}

export function publicAuditTargetIdOrNull(value: string | null, targetType: string) {
  const policy = auditTargetPolicy(targetType);
  const expectedPrefix = policy?.mode === "public" ? policy.prefix : null;
  const parsed = value ? parsePublicId(value) : null;
  return expectedPrefix && parsed?.prefix === expectedPrefix ? value : null;
}

export function redactAuditIds(value: unknown, field?: string): unknown {
  if (isIdentifierField(field)) {
    if (typeof value === "number") return "[redacted]";
    if (typeof value === "string" && !parsePublicId(value)) return "[redacted]";
  }
  if (Array.isArray(value)) return value.map((entry) => redactAuditIds(entry, field));
  if (!value || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
      key,
      redactAuditIds(entry, key),
    ]),
  );
}
