import { auditPayloadPolicy } from "@/lib/auth/audit-field-declarations";
import { sanitizeDeclaredAuditPayload } from "@/lib/auth/audit-payload-policy";
import { PROVIDER_CATALOG } from "@/lib/providers/catalog-metadata";
import { diffFor } from "@/lib/queries/audit-diff";
import { redactAuditIds } from "@/lib/queries/audit-public-values";
import { rankCheckRunSkipFor } from "@/lib/queries/audit-rank-check-run-skip";

export type ProviderSourceChange = { provider: string; source: "hosted" | "own" };

export function providerSourceChangeFor(
  action: string,
  after: unknown,
): ProviderSourceChange | undefined {
  if (action !== "provider.credential_source_changed" || !after || typeof after !== "object")
    return undefined;
  const { provider, source } = after as Record<string, unknown>;
  const item = PROVIDER_CATALOG.find((item) => item.id === provider);
  return item && (source === "own" || source === "hosted")
    ? { provider: item.label, source }
    : undefined;
}

export function auditEventDetailsFor(action: string, before: unknown, after: unknown) {
  const policy = auditPayloadPolicy(action);
  const safeBefore = redactAuditIds(sanitizeDeclaredAuditPayload(before, policy?.before));
  const safeAfter = redactAuditIds(sanitizeDeclaredAuditPayload(after, policy?.after));
  return {
    diff: diffFor(safeBefore, safeAfter),
    providerSourceChange: providerSourceChangeFor(action, safeAfter),
    rankCheckRunSkip: rankCheckRunSkipFor(action, safeAfter),
  };
}
