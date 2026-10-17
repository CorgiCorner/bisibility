import type {
  BusinessObservationItem,
  IdentityRevision,
  MatchEvaluation,
  MatchReason,
} from "./dto";
import { businessMatcherVersion, mapsBusinessMatcherVersion } from "./dto";
import {
  identifierKey,
  localResult,
  observationIdentifiers,
  organicEligibility,
  strongEvidence,
  validOrdinals,
  weakEvidence,
} from "./match-evidence";
import { identityRevisionSchema, referenceSchema, timestampSchema } from "./schema";

function repeated(values: readonly string[]) {
  const seen = new Set<string>(),
    duplicates = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  return duplicates;
}

function sourceOrdinalKey(item: BusinessObservationItem) {
  if (item.surface === "maps" && item.originalOrdinals.group != null)
    return JSON.stringify([
      item.surface,
      item.resultKind,
      item.promotion,
      item.originalOrdinals.group,
    ]);
  const { page, block, slot } = item.originalOrdinals;
  return page !== null && block !== null && slot !== null
    ? JSON.stringify([item.surface, item.resultKind, page, block, slot])
    : null;
}

/** Evaluates the complete recorded collection; it never picks a higher weak hit. */
export function matchBusinessCollection(input: {
  projectId: string;
  observationRunId: string;
  targets: readonly IdentityRevision[];
  items: readonly BusinessObservationItem[];
  /** Registry remains complete; only requested entity evaluations need materialization. */
  targetEntityIds?: readonly string[];
}): readonly MatchEvaluation[] {
  referenceSchema.parse(input.projectId);
  referenceSchema.parse(input.observationRunId);
  const targets = input.targets.map((target) => identityRevisionSchema.parse(target));
  if (targets.some((target) => target.projectId !== input.projectId))
    throw new Error("Identity belongs to another project.");
  if (new Set(targets.map((target) => target.entityId)).size !== targets.length)
    throw new Error("One identity revision per entity is required.");
  const selected = input.targetEntityIds
    ? new Set(input.targetEntityIds.map((id) => referenceSchema.parse(id)))
    : null;
  if (
    selected &&
    (!selected.size ||
      selected.size !== input.targetEntityIds?.length ||
      [...selected].some((id) => !targets.some((target) => target.entityId === id)))
  )
    throw new Error("Requested identity is outside the captured registry.");
  for (const item of input.items) {
    if (item.projectId !== input.projectId || item.observationRunId !== input.observationRunId)
      throw new Error("Observation belongs to another project or run.");
    referenceSchema.parse(item.itemId);
    timestampSchema.parse(item.observedAt);
  }
  const owners = new Map<string, Set<string>>();
  for (const target of targets)
    for (const identifier of target.snapshot.identifiers) {
      const key = identifierKey(identifier),
        set = owners.get(key) ?? new Set<string>();
      set.add(target.entityId);
      owners.set(key, set);
    }
  const duplicatedItems = repeated(input.items.map((item) => item.itemId));
  const duplicatedOrdinals = repeated(
    input.items.flatMap((item) => {
      const key = sourceOrdinalKey(item);
      return key ? [key] : [];
    }),
  );
  const observations = input.items.map((item) => {
    const evidence = observationIdentifiers(item);
    const ownerSets = evidence.values.flatMap((identifier) => {
      const set = owners.get(identifierKey(identifier));
      return set ? [set] : [];
    });
    const entities = new Set(ownerSets.flatMap((set) => [...set]));
    const contradictory = entities.size > 1 && ownerSets.every((set) => set.size === 1);
    const ordinalKey = sourceOrdinalKey(item);
    let anomaly: MatchReason | null = item.identityIssue ?? evidence.anomaly;
    if (!validOrdinals(item)) anomaly = "invalid_ordinals";
    else if (duplicatedItems.has(item.itemId) || (ordinalKey && duplicatedOrdinals.has(ordinalKey)))
      anomaly = "duplicate_observation_identity";
    else if (!anomaly && contradictory) anomaly = "contradictory_identifiers";
    return { item, evidence, anomaly };
  });
  const result: MatchEvaluation[] = [];
  for (const target of targets) {
    if (selected && !selected.has(target.entityId)) continue;
    const strong = observations.map((observation) => strongEvidence(target, observation.evidence));
    // Unknown promotion may still be organic; only proven ads form a separate cohort.
    const exactCounts = new Map<boolean, number>();
    strong.forEach((evidence, index) => {
      if (evidence.exact.length && !evidence.conflict && !observations[index].anomaly) {
        const cohort = observations[index].item.promotion === "promoted";
        exactCounts.set(cohort, (exactCounts.get(cohort) ?? 0) + 1);
      }
    });
    for (const [index, observation] of observations.entries()) {
      const { item, evidence, anomaly } = observation,
        exact = strong[index];
      const knownOther = evidence.values.some((identifier) => {
        const known = owners.get(identifierKey(identifier));
        return known?.size === 1 && !known.has(target.entityId);
      });
      const ambiguousRegistry = evidence.values.some(
        (identifier) =>
          (owners.get(identifierKey(identifier))?.size ?? 0) > 1 &&
          target.snapshot.identifiers.some(
            (configured) => identifierKey(configured) === identifierKey(identifier),
          ),
      );
      let status: MatchEvaluation["status"] = "unresolved",
        matchedBy: MatchEvaluation["matchedBy"] = null,
        reason: MatchReason = anomaly ?? "insufficient_evidence";
      if (!anomaly) {
        if (exact.conflict || (!exact.exact.length && knownOther)) {
          status = "rejected";
          reason = "stable_identifier_conflict";
        } else if (exact.exact.length && ambiguousRegistry) reason = "ambiguous_registry_identity";
        else if (exact.exact.length && (exactCounts.get(item.promotion === "promoted") ?? 0) > 1)
          reason = "ambiguous_exact_items";
        else if (exact.exact.length) {
          status = "confirmed";
          matchedBy = "stable_id";
          reason = "exact_identifier";
        } else {
          const weak = weakEvidence(target, item);
          if (weak) {
            status = "candidate";
            matchedBy = weak.matchedBy;
            reason = weak.reason;
          }
        }
      }
      const match = {
        projectId: input.projectId,
        entityId: target.entityId,
        identityRevisionId: target.id,
        observationRunId: input.observationRunId,
        itemId: item.itemId,
        observedAt: item.observedAt,
        matcherVersion:
          item.surface === "maps" || item.surface === "local_finder"
            ? mapsBusinessMatcherVersion
            : businessMatcherVersion,
        status,
        matchedBy,
        reason,
        evidenceIdentifierTypes: Object.freeze(exact.exact),
        originalOrdinals: Object.freeze({ ...item.originalOrdinals }),
        promotion: item.promotion,
        localResult: localResult(item),
      };
      result.push(Object.freeze({ ...match, organicEligible: organicEligibility(match) }));
    }
  }
  return Object.freeze(result);
}
