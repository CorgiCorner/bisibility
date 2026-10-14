import "server-only";
import type { LocalMonitorScheduleIntent } from "@/lib/generated/prisma/client";
import { nextRecurringSlot } from "@/lib/local-monitor-recurring/calendar";
import { calendarSchema } from "@/lib/local-monitor-recurring/schema";
import type { LocalTransaction } from "@/lib/local-monitoring-store/context";
import type { HostPolicySnapshot } from "@/lib/measurement-definitions/host-policy-contract";
import { readHostPolicySnapshot } from "@/lib/measurement-definitions/host-policy-snapshot";
import type { LocalResultBinding } from "./binding";
import type { LocalFreshnessPolicy } from "./model";

type Captured = Pick<LocalResultBinding, "occurrence" | "revision">;
/** Today's explicit policy and the original immutable intent; no historical policy backfill. */
export function localFreshnessFromIntent(
  captured: Captured,
  intent: LocalMonitorScheduleIntent | null,
  policy: HostPolicySnapshot,
  asOf: Date,
): LocalFreshnessPolicy {
  const unavailable: LocalFreshnessPolicy = {
    basis: null,
    freshForMs: null,
    freshnessReason: "policy_unavailable",
    policyEpoch: policy.policyEpoch,
    configurationRevision: policy.config?.freshness.configurationRevision ?? null,
    semantics: "current_project_policy_with_original_intent",
  };
  if (policy.state !== "ready" || !policy.config) return unavailable;
  const original = captured.occurrence;
  if (
    !intent ||
    intent.id !== original.scheduleIntentId ||
    intent.projectId !== original.projectId ||
    intent.monitorId !== original.monitorId ||
    intent.definitionRevisionId !== captured.revision.id ||
    original.definitionRevisionId !== captured.revision.id ||
    intent.createdAt > original.createdAt ||
    !Number.isFinite(asOf.getTime())
  )
    return { ...unavailable, freshnessReason: "invalid_policy" };
  const config = policy.config.freshness;
  let freshForMs: number | null, basis: LocalFreshnessPolicy["basis"];
  if (original.mode === "manual") {
    freshForMs = config.manualTtlMs;
    basis = "manual_ttl";
  } else if (original.mode === "scheduled" && intent.mode === "scheduled") {
    const parsed = calendarSchema.safeParse(intent.snapshot);
    if (
      !parsed.success ||
      intent.scheduleId !== parsed.data.scheduleId ||
      config.cadenceGraceMs === null
    )
      return unavailable;
    try {
      const first = nextRecurringSlot(parsed.data, original.monitorId, asOf),
        second = nextRecurringSlot(parsed.data, original.monitorId, first.dueAt);
      freshForMs = second.dueAt.getTime() - first.dueAt.getTime() + config.cadenceGraceMs;
      basis = "captured_calendar";
    } catch {
      return { ...unavailable, freshnessReason: "invalid_policy" };
    }
  } else return { ...unavailable, freshnessReason: "invalid_policy" };
  if (freshForMs === null) return unavailable;
  if (!Number.isSafeInteger(freshForMs) || freshForMs < 0)
    return { ...unavailable, freshnessReason: "invalid_policy" };
  return { ...unavailable, basis, freshForMs, freshnessReason: null };
}
export async function readLocalRunFreshness(
  tx: LocalTransaction,
  binding: LocalResultBinding,
  asOf: Date,
) {
  const policy = await readHostPolicySnapshot(tx, binding.run.projectId);
  const intent =
    policy.state === "ready"
      ? await tx.localMonitorScheduleIntent.findFirst({
          where: {
            projectId: binding.run.projectId,
            monitorId: binding.occurrence.monitorId,
            id: binding.occurrence.scheduleIntentId,
            definitionRevisionId: binding.revision.id,
          },
        })
      : null;
  return localFreshnessFromIntent(binding, intent, policy, asOf);
}
