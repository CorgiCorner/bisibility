import type { AuditIntent, EntityMatch, MatchEvaluation, TrustedWriteContext } from "./dto";
import { assertTrustedWrite } from "./identity-revisions";
import { organicEligibility } from "./match-evidence";
import { referenceSchema, timestampSchema } from "./schema";

function assertAppendOnly(input: {
  id: string;
  evaluation: MatchEvaluation;
  current: EntityMatch | null;
  expectedDecisionRevision: number;
  recordedAt: string;
}) {
  referenceSchema.parse(input.id);
  timestampSchema.parse(input.recordedAt);
  const current = input.current;
  if ((current?.decisionRevision ?? 0) !== input.expectedDecisionRevision)
    throw new Error("Match decision revision conflict.");
  if (!current) return;
  const next = input.evaluation;
  if (
    input.id === current.id ||
    next.projectId !== current.projectId ||
    next.entityId !== current.entityId ||
    next.observationRunId !== current.observationRunId ||
    next.itemId !== current.itemId
  ) {
    throw new Error("Match decision scope conflict.");
  }
  if (
    next.observedAt !== current.observedAt ||
    (["page", "block", "slot", "absolute", "group", "scale"] as const).some(
      (key) => next.originalOrdinals[key] !== current.originalOrdinals[key],
    )
  )
    throw new Error("Recorded observation identity or ordinals cannot change.");
  if (Date.parse(input.recordedAt) < Date.parse(current.recordedAt))
    throw new Error("Match decision cannot precede its predecessor.");
}

function makeDecision(input: {
  id: string;
  evaluation: MatchEvaluation;
  current: EntityMatch | null;
  recordedAt: string;
  source: EntityMatch["source"];
  confirmedBy: string | null;
  reviewReason: string | null;
}): EntityMatch {
  const evaluation = input.evaluation;
  return Object.freeze({
    ...evaluation,
    evidenceIdentifierTypes: Object.freeze([...evaluation.evidenceIdentifierTypes]),
    originalOrdinals: Object.freeze({ ...evaluation.originalOrdinals }),
    organicEligible: organicEligibility(evaluation),
    id: input.id,
    decisionRevision: (input.current?.decisionRevision ?? 0) + 1,
    previousDecisionId: input.current?.id ?? null,
    source: input.source,
    confirmedBy: input.confirmedBy,
    recordedAt: input.recordedAt,
    reviewReason: input.reviewReason,
  });
}

export function planAutomaticMatch(input: {
  id: string;
  evaluation: MatchEvaluation;
  current: EntityMatch | null;
  expectedDecisionRevision: number;
  context: TrustedWriteContext;
  recordedAt: string;
  idempotencyKey: string;
}): Readonly<{ decision: EntityMatch; audit: AuditIntent }> {
  assertTrustedWrite(input.context, input.evaluation.projectId);
  referenceSchema.parse(input.idempotencyKey);
  assertAppendOnly(input);
  if (input.evaluation.matchedBy === "manual")
    throw new Error("Automatic rematch requires fresh retained-data evaluation.");
  const decision = makeDecision({
    ...input,
    source: input.current ? "rematch" : "automatic",
    confirmedBy: null,
    reviewReason: null,
  });
  const audit = Object.freeze({
    action: input.current
      ? ("business_location.rematched" as const)
      : ("business_location.match_recorded" as const),
    projectId: decision.projectId,
    actorId: input.context.actorId,
    entityId: decision.entityId,
    revisionId: decision.id,
    previousId: decision.previousDecisionId,
    idempotencyKey: input.idempotencyKey,
    recordedAt: input.recordedAt,
  });
  return Object.freeze({ decision, audit });
}

export function planCandidateReview(input: {
  id: string;
  current: EntityMatch;
  context: TrustedWriteContext;
  currentIdentityRevisionId: string;
  entityState: "active" | "archived";
  recordedAt: string;
  idempotencyKey: string;
  intent: Readonly<{
    action: "confirm" | "reject";
    decisionId: string;
    expectedDecisionRevision: number;
    identityRevisionId: string;
    entityId: string;
    observationRunId: string;
    itemId: string;
    reason: string;
  }>;
}): Readonly<{ decision: EntityMatch; audit: AuditIntent }> {
  const current = input.current,
    intent = input.intent;
  assertTrustedWrite(input.context, current.projectId);
  referenceSchema.parse(input.idempotencyKey);
  if (
    input.entityState !== "active" ||
    input.currentIdentityRevisionId !== current.identityRevisionId ||
    intent.identityRevisionId !== current.identityRevisionId
  )
    throw new Error("Candidate identity revision conflict.");
  if (
    intent.decisionId !== current.id ||
    intent.entityId !== current.entityId ||
    intent.observationRunId !== current.observationRunId ||
    intent.itemId !== current.itemId
  )
    throw new Error("Confirmation must name the exact candidate item.");
  if (!intent.reason.trim() || intent.reason.length > 500)
    throw new Error("A review reason is required.");
  const weakReasons = ["weak_name", "weak_domain", "weak_name_and_domain"];
  if (
    intent.action === "confirm" &&
    (current.status !== "candidate" ||
      !weakReasons.includes(current.reason) ||
      !["name", "domain", "name_and_domain"].includes(current.matchedBy ?? ""))
  )
    throw new Error("Only a non-conflicting candidate can be confirmed.");
  if (!["confirm", "reject"].includes(intent.action))
    throw new Error("Invalid candidate review action.");
  const evaluation: MatchEvaluation = {
    ...current,
    status: intent.action === "confirm" ? "confirmed" : "rejected",
    matchedBy: "manual",
    reason: intent.action === "confirm" ? "manually_confirmed_item" : "manually_rejected_item",
  };
  assertAppendOnly({
    ...input,
    evaluation,
    expectedDecisionRevision: intent.expectedDecisionRevision,
  });
  const decision = makeDecision({
    ...input,
    evaluation,
    source: "manual",
    confirmedBy: intent.action === "confirm" ? input.context.actorId : null,
    reviewReason: intent.reason,
  });
  const audit = Object.freeze({
    action:
      intent.action === "confirm"
        ? ("business_location.match_confirmed" as const)
        : ("business_location.match_rejected" as const),
    projectId: current.projectId,
    actorId: input.context.actorId,
    entityId: current.entityId,
    revisionId: input.id,
    previousId: current.id,
    idempotencyKey: input.idempotencyKey,
    recordedAt: input.recordedAt,
  });
  return Object.freeze({ decision, audit });
}

/** Pure decision construction for custody-verified original evidence, never user rematch authority. */
export function planCollectedMatch(input: {
  id: string;
  evaluation: MatchEvaluation;
  recordedAt: string;
}): EntityMatch {
  assertAppendOnly({ ...input, current: null, expectedDecisionRevision: 0 });
  if (input.evaluation.matchedBy === "manual")
    throw new Error("Original evidence cannot contain a manual decision.");
  return makeDecision({
    ...input,
    current: null,
    source: "automatic",
    confirmedBy: null,
    reviewReason: null,
  });
}
