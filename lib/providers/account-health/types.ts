import type { ProviderErrorCode } from "@/lib/providers/provider-error-code";

export type AccountHealth =
  | "ready"
  | "payment_required"
  | "credentials_rejected"
  | "access_restricted"
  | "not_verified";
export type CapabilityScope = { kind: "account" } | { kind: "capability"; capability: string };
export type AccountEvidence = {
  reason: ProviderErrorCode;
  source: "account_probe" | "provider_response";
  observedAt: string;
  credentialVersion: string;
  scope: CapabilityScope;
};
export type ProbeProgress = {
  state: "idle" | "checking";
  lastOutcome: ProviderErrorCode | "ready" | "not_verified" | null;
  checkedAt: string | null;
  nextCheckAt: string | null;
};
export type AccountHealthView = {
  health: AccountHealth;
  evidence: AccountEvidence | null;
  probe: ProbeProgress;
};
export type RecoveryAdmissionReason = "account_blocked" | "accounting_review";

export function sameAccountScope(value: unknown, expected: CapabilityScope) {
  if (!value || typeof value !== "object" || !("kind" in value)) return false;
  return (
    value.kind === expected.kind &&
    (expected.kind === "account" ||
      ("capability" in value && value.capability === expected.capability))
  );
}
