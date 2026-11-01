import type { AccountRecoveryState } from "./types";

export type RecoveryReason =
  | "provider_billing"
  | "provider_auth"
  | "provider_account_restricted"
  | "not_verified"
  | "accounting_review";

type Incident = { reason: string; scope: unknown; id?: string };

export function selectConnectionRecovery(input: {
  accountState: string | null;
  incidents: readonly Incident[];
  currentIncidentId?: string | null;
  unconfirmedRequests: number;
  probeId: string | null;
  probeAvailable: boolean;
  nextCheckAt: string | null;
}) {
  const applicable = input.incidents.find(({ scope }) => {
    if (!scope || typeof scope !== "object" || !("kind" in scope)) return false;
    return scope.kind === "account" || ("capability" in scope && scope.capability === "rank_check");
  });
  const currentOpen = input.incidents.some(({ id }) => id && id === input.currentIncidentId);
  const legacyBlocked =
    input.accountState !== null && input.accountState !== "verified" && !currentOpen;
  const code = applicable?.reason;
  const reason: RecoveryReason | null =
    code === "provider_billing" ||
    code === "provider_auth" ||
    code === "provider_account_restricted"
      ? code
      : applicable || legacyBlocked
        ? input.accountState === "payment_required" && (!applicable || code === "legacy_unverified")
          ? "provider_billing"
          : "not_verified"
        : input.unconfirmedRequests > 0
          ? "accounting_review"
          : null;
  const accountVerified =
    input.accountState === ("verified" satisfies AccountRecoveryState) && !applicable;
  return {
    state:
      reason === "provider_billing"
        ? ("billing" as const)
        : reason
          ? ("review" as const)
          : ("ready" as const),
    reason,
    scope:
      applicable?.scope && typeof applicable.scope === "object" && "kind" in applicable.scope
        ? applicable.scope.kind === "capability" &&
          "capability" in applicable.scope &&
          applicable.scope.capability === "rank_check"
          ? ({ kind: "capability", capability: "rank_check" } as const)
          : ({ kind: "account" } as const)
        : null,
    accountVerified,
    paused: reason !== null,
    checking: input.probeId !== null,
    canCheck: input.probeAvailable,
    nextCheckAt: input.probeAvailable ? input.nextCheckAt : null,
  };
}
