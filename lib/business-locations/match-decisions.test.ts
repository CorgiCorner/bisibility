import { describe, expect, it } from "vitest";
import { matchBusinessCollection } from "./match";
import { planAutomaticMatch, planCandidateReview } from "./match-decisions";
import {
  cidB,
  item,
  observationRunId,
  projectId,
  recordedAt,
  revision,
  writeContext,
} from "./test-fixtures";

function initial(cid: unknown = null) {
  const evaluation = matchBusinessCollection({
    projectId,
    observationRunId,
    targets: [revision()],
    items: [item("candidate_item", 3, cid)],
  })[0];
  return planAutomaticMatch({
    id: "decision_1",
    evaluation,
    current: null,
    expectedDecisionRevision: 0,
    context: writeContext,
    recordedAt,
    idempotencyKey: "automatic_1",
  }).decision;
}
function review(overrides: Partial<Parameters<typeof planCandidateReview>[0]> = {}) {
  const current = initial();
  return planCandidateReview({
    id: "decision_2",
    current,
    context: writeContext,
    currentIdentityRevisionId: current.identityRevisionId,
    entityState: "active",
    recordedAt: "2026-10-02T10:00:00.000Z",
    idempotencyKey: "review_1",
    intent: {
      action: "confirm",
      decisionId: current.id,
      expectedDecisionRevision: 1,
      identityRevisionId: current.identityRevisionId,
      entityId: current.entityId,
      observationRunId: current.observationRunId,
      itemId: current.itemId,
      reason: "Editor reviewed this specific item",
    },
    ...overrides,
  });
}

describe("append-only item review", () => {
  it("confirms only the explicit item, records the actor and review reason, and does not turn future weak hits into a rule", () => {
    const before = initial(),
      { decision, audit } = review({ current: before });
    expect(decision).toMatchObject({
      status: "confirmed",
      matchedBy: "manual",
      source: "manual",
      previousDecisionId: before.id,
      decisionRevision: 2,
      confirmedBy: writeContext.actorId,
      organicEligible: true,
      reviewReason: "Editor reviewed this specific item",
    });
    expect(before.status).toBe("candidate");
    expect(initial().status).toBe("candidate");
    expect(audit).toMatchObject({
      action: "business_location.match_confirmed",
      previousId: before.id,
      revisionId: decision.id,
    });
    expect(audit).not.toHaveProperty("reviewReason");
  });
  it("never overrides hard rejection or unresolved identity anomalies with manual confirmation", () => {
    const rejected = initial(cidB);
    expect(() => review({ current: rejected })).toThrow("non-conflicting candidate");
    expect(() => review({ current: { ...rejected, status: "candidate" } })).toThrow(
      "non-conflicting candidate",
    );
    const unsafe = initial(Number("18446744073709551615"));
    expect(() => review({ current: unsafe })).toThrow("non-conflicting candidate");
  });
  it("blocks stale candidate/identity, foreign context and read-only/archived writes", () => {
    const current = initial(),
      intent = {
        action: "confirm" as const,
        decisionId: current.id,
        expectedDecisionRevision: 1,
        identityRevisionId: current.identityRevisionId,
        entityId: current.entityId,
        observationRunId: current.observationRunId,
        itemId: current.itemId,
        reason: "Specific item",
      };
    expect(() => review({ intent: { ...intent, itemId: "foreign_item" } })).toThrow(
      "exact candidate",
    );
    expect(() => review({ intent: { ...intent, expectedDecisionRevision: 0 } })).toThrow(
      "revision conflict",
    );
    expect(() => review({ currentIdentityRevisionId: "new_identity" })).toThrow(
      "identity revision",
    );
    expect(() => review({ context: { ...writeContext, canWrite: false } })).toThrow(
      "not authorized",
    );
    expect(() => review({ context: { ...writeContext, writeMode: "read_only" } })).toThrow(
      "not authorized",
    );
    expect(() => review({ entityState: "archived" })).toThrow("identity revision");
  });
  it("retains nonorganic classification through explicit manual item confirmation", () => {
    const current = { ...initial(), promotion: "unknown" as const };
    expect(review({ current }).decision.organicEligible).toBe(false);
  });
  it("appends explicit rejection instead of deleting the candidate", () => {
    const current = initial();
    const result = review({
      intent: {
        action: "reject",
        decisionId: current.id,
        expectedDecisionRevision: 1,
        identityRevisionId: current.identityRevisionId,
        entityId: current.entityId,
        observationRunId: current.observationRunId,
        itemId: current.itemId,
        reason: "Another branch",
      },
    });
    expect(result.decision).toMatchObject({
      status: "rejected",
      previousDecisionId: current.id,
      confirmedBy: null,
      organicEligible: false,
    });
    expect(current.status).toBe("candidate");
  });
});

describe("retained-data rematch", () => {
  it("appends another matcher decision and audit intent without mutating the earlier observed item or time/ordinals", () => {
    const current = initial(),
      before = structuredClone(current);
    const next = planAutomaticMatch({
      id: "decision_2",
      evaluation: { ...current, matcherVersion: "business-match-v2" },
      current,
      expectedDecisionRevision: 1,
      context: writeContext,
      recordedAt: "2026-10-03T10:00:00.000Z",
      idempotencyKey: "rematch_1",
    });
    expect(next.decision).toMatchObject({
      source: "rematch",
      previousDecisionId: current.id,
      decisionRevision: 2,
      matcherVersion: "business-match-v2",
      observedAt: current.observedAt,
      originalOrdinals: current.originalOrdinals,
    });
    expect(current).toEqual(before);
    expect(next.audit.action).toBe("business_location.rematched");
  });
  it("refuses renumbering, another item/run and backwards decision time", () => {
    const current = initial();
    const input = {
      id: "decision_2",
      evaluation: current,
      current,
      expectedDecisionRevision: 1,
      context: writeContext,
      recordedAt: "2026-10-03T10:00:00.000Z",
      idempotencyKey: "rematch_1",
    };
    expect(() =>
      planAutomaticMatch({
        ...input,
        evaluation: { ...current, originalOrdinals: { ...current.originalOrdinals, slot: 1 } },
      }),
    ).toThrow("ordinals");
    expect(() =>
      planAutomaticMatch({ ...input, evaluation: { ...current, itemId: "other_item" } }),
    ).toThrow("scope conflict");
    expect(() => planAutomaticMatch({ ...input, recordedAt: "2026-09-30T10:00:00.000Z" })).toThrow(
      "predecessor",
    );
  });
});
