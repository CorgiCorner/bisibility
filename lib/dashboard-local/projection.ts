import { businessDigest } from "@/lib/business-location-store/canonical";
import { storedMatch } from "@/lib/business-location-store/match-repository";
import { projectRetainedBusinessObservation } from "@/lib/business-location-store/observation-read";
import { businessMatcherVersion } from "@/lib/business-locations/dto";
import type { BusinessMatchDecision } from "@/lib/generated/prisma/client";
import { objectValue } from "@/lib/rank-measurements/recorded-check";
import { resolveMeasurements } from "@/lib/rank-measurements/resolve";
import type { MeasurementEvidence, MeasurementPolicy } from "@/lib/rank-measurements/types";
import type { RankReportPolicy } from "@/lib/rank-reports/model";
import { targetReportBaseline } from "@/lib/rank-reports/policy";
import { localBaseMeasurement, localScope } from "./measurement";
import type { LocalExpectedMetadata, LocalRow } from "./model";
import type { LocalRetainedCheck } from "./read";

type Scope = {
  projectId: string;
  entityId: string;
  identityRevisionId: string;
  asOf: Date;
  policy?: RankReportPolicy;
};
function unknown(value: MeasurementEvidence) {
  return { ...value, effectiveScope: null, position: null, completeThrough: null };
}

export function projectLocalCheck(
  check: LocalRetainedCheck,
  targetId: string,
  decisions: ReadonlyMap<string, BusinessMatchDecision>,
  scope: Scope,
) {
  let base = localBaseMeasurement({ ...check, id: check.publicId }, targetId, scope.projectId);
  const reasons: string[] = [];
  const missing = () => ({ presence: unknown(base), target: unknown(base), reasons });
  if (!check.observationRun) {
    reasons.push("observation_unavailable");
    return missing();
  }
  const run = check.observationRun;
  const localProof = objectValue(
    objectValue(objectValue(run.requestPolicy)?.evidence)?.webLocalPack,
  );
  const nativeProvider = run.provider === "dataforseo" || run.provider === "serpapi";
  if (
    nativeProvider &&
    (localProof?.version !== 1 ||
      typeof localProof.identityIssues !== "number" ||
      !Number.isSafeInteger(localProof.identityIssues) ||
      Number(localProof.identityIssues) < 0)
  ) {
    reasons.push("local_pack_adapter_proof_unavailable");
    return missing();
  }
  // v1 native local proof has no exhaustive absence capability, regardless of a copied depth field.
  if (nativeProvider) base = { ...base, completeThrough: null };
  const identitySafe = !nativeProvider || localProof?.identityIssues === 0;
  let normalized: ReturnType<typeof projectRetainedBusinessObservation>;
  try {
    normalized = projectRetainedBusinessObservation(run);
  } catch {
    reasons.push("retained_evidence_unavailable");
    return missing();
  }
  const pack = normalized.items.filter((item) => item.resultKind === "local_pack");
  const organic = pack.filter((item) => item.promotion === "organic");
  const unknownPromotion = pack.some((item) => item.promotion === "unknown");
  const validSlot = (value: number | null) =>
    value !== null && Number.isSafeInteger(value) && value > 0;
  const complete =
    run.completeness === "complete" && base.completeThrough !== null && base.completeThrough >= 3;
  const oneBlock =
    new Set(
      organic.map((item) =>
        JSON.stringify([
          item.originalOrdinals.page,
          normalized.sourceByItem.get(item.itemId)?.sourceBlockId,
        ]),
      ),
    ).size <= 1;
  const slotProof =
    oneBlock &&
    organic.every(
      (item) =>
        normalized.sourceByItem.get(item.itemId)?.rankScale === "pack_slot" &&
        validSlot(item.originalOrdinals.slot),
    );
  const timeProof =
    base.observedAt !== null &&
    base.observedAt <= scope.asOf &&
    normalized.items.every(
      (item) =>
        Date.parse(item.observedAt) === base.observedAt?.getTime() &&
        Date.parse(item.observedAt) <= scope.asOf.getTime(),
    );
  const presenceProven = timeProof && (organic.length > 0 || (complete && !unknownPromotion));
  const presence = presenceProven
    ? {
        ...base,
        position: organic.length ? 1 : null,
        completeThrough: organic.length ? base.completeThrough : 3,
      }
    : unknown(base);
  const confirmed: number[] = [];
  let matchProof = timeProof && slotProof && !unknownPromotion && identitySafe;
  if (!identitySafe) reasons.push("local_pack_identity_unavailable");
  for (const item of organic) {
    const row = decisions.get(item.itemId);
    try {
      if (!row) throw new Error("No retained decision");
      const decision = storedMatch(row),
        source = normalized.sourceByItem.get(item.itemId);
      const proof = objectValue(row.evidence);
      if (
        row.recordedAt > scope.asOf ||
        decision.projectId !== scope.projectId ||
        decision.entityId !== scope.entityId ||
        decision.identityRevisionId !== scope.identityRevisionId ||
        decision.matcherVersion !== businessMatcherVersion ||
        decision.observationRunId !== run.id ||
        !decision.localResult ||
        (decision.status === "confirmed" && !decision.organicEligible) ||
        proof?.normalizedItemHash !== businessDigest(item) ||
        businessDigest(decision.observationSource) !== businessDigest(source) ||
        (decision.status !== "confirmed" && decision.status !== "rejected")
      )
        throw new Error("Unproved match");
      if (decision.status === "confirmed" && item.originalOrdinals.slot !== null)
        confirmed.push(item.originalOrdinals.slot);
    } catch {
      matchProof = false;
    }
  }
  // Universal complete absence applies to any selected identity. Otherwise every candidate needs a retained decision.
  const targetProven = presenceProven && matchProof && (confirmed.length > 0 || complete);
  if (!presenceProven) reasons.push("local_pack_coverage_unavailable");
  if (!oneBlock) reasons.push("ambiguous_local_pack_blocks");
  if (!matchProof) reasons.push("identity_match_unavailable");
  const target = targetProven
    ? {
        ...base,
        configuredScope: localScope(base.configuredScope, scope.identityRevisionId),
        effectiveScope: localScope(base.effectiveScope, scope.identityRevisionId),
        position: confirmed.length ? Math.min(...confirmed) : null,
      }
    : unknown(base);
  return { presence, target, reasons };
}

export function projectLocalRows(
  targets: readonly { id: string; publicId: string; text: string }[],
  checks: readonly LocalRetainedCheck[],
  decisions: ReadonlyMap<string, BusinessMatchDecision>,
  metadata: ReadonlyMap<string, LocalExpectedMetadata>,
  scope: Scope,
): LocalRow[] {
  const byTarget = new Map<string, LocalRetainedCheck[]>();
  for (const check of checks) {
    const targetChecks = byTarget.get(check.keywordId) ?? [];
    targetChecks.push(check);
    byTarget.set(check.keywordId, targetChecks);
  }
  return targets.map((target) => {
    const values = (byTarget.get(target.id) ?? []).map((check) =>
      projectLocalCheck(check, target.publicId, decisions, scope),
    );
    const captured = metadata.get(target.publicId);
    const policy: MeasurementPolicy = {
      asOf: scope.asOf,
      horizon: 3,
      requireCurrentScope: true,
      freshForMs: captured?.freshForMs ?? null,
      ...(scope.policy
        ? targetReportBaseline({ baselineWindow: captured?.baselineWindow ?? null }, scope.policy)
        : { baselineEnabled: false }),
      currentNotBefore: scope.policy?.currentNotBefore ?? undefined,
      expectedScope: localScope(captured?.expectedScope ?? null, null),
    };
    return {
      retainedChecks: (byTarget.get(target.id) ?? []).length,
      baselineWindow: captured?.baselineWindow ?? null,
      keywordId: target.publicId,
      text: target.text,
      presence: resolveMeasurements(
        values.map((value) => value.presence),
        { ...policy, horizon: 1 },
      ),
      target: resolveMeasurements(
        values.map((value) => value.target),
        {
          ...policy,
          expectedScope: localScope(captured?.expectedScope ?? null, scope.identityRevisionId),
        },
      ),
      reasons: [...new Set(values.flatMap((value) => value.reasons))],
    };
  });
}
