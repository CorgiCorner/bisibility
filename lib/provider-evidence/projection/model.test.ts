import { describe, expect, it } from "vitest";
import {
  type CheckProjectionSource,
  type OperationProjectionSource,
  projectCheckEvidence,
  projectionCounts,
} from "./model";

const check: CheckProjectionSource = {
  attemptCount: 1,
  checkedAt: new Date("2026-10-23T06:01:00Z"),
  provider: "winner",
  status: "failed",
  recoveryRestoredAt: null,
  recoveryProvenance: null,
  partialEvidence: [],
};
function operation(
  overrides: Partial<NonNullable<OperationProjectionSource["evidence"]>> = {},
): OperationProjectionSource {
  return {
    operationPk: "winner",
    provider: "winner",
    accountingOnly: false,
    evidence: {
      acceptance: "accepted",
      fulfillment: "pending",
      returnedDepth: null,
      accounting: "unknown",
      exhaustionStatus: "pending",
      exhaustionReason: null,
      recoveryState: "scheduled",
      lastAttemptAt: null,
      nextAttemptAt: null,
      recoveryReason: null,
      ...overrides,
    },
  };
}
describe("check evidence projection", () => {
  it.each([
    ["pending", "under_review"],
    ["complete", "recovered"],
    ["partial", "partial"],
    ["provider_error", "provider_error"],
    ["absent", "missing"],
  ] as const)("maps %s using the canonical customer mapping", (fulfillment, result) => {
    expect(projectCheckEvidence(check, [operation({ fulfillment })])).toMatchObject({ result });
  });
  it.each([
    ["accepted", "measured"],
    ["unconfirmed", "unknown"],
    ["rejected", "conflict"],
  ] as const)("preserves independent dimensions %s / %s", (acceptance, accounting) => {
    expect(projectCheckEvidence(check, [operation({ acceptance, accounting })])).toMatchObject({
      acceptance,
      accounting,
    });
  });
  it("keeps unknown cost on a recovered result and its original time", () => {
    expect(
      projectCheckEvidence({ ...check, recoveryRestoredAt: new Date() }, [
        operation({
          fulfillment: "complete",
          exhaustionStatus: "exhausted",
          exhaustionReason: "retention_expired",
        }),
      ]),
    ).toMatchObject({
      result: "recovered",
      cost: "unknown",
      originalCheckedAt: "2026-10-23T06:01:00.000Z",
    });
  });
  it("never uses an accounting-only earlier attempt behind a fallback winner", () => {
    const earlier = {
      ...operation({ fulfillment: "complete", accounting: "conflict" }),
      provider: "earlier",
      accountingOnly: true,
    };
    expect(projectCheckEvidence({ ...check, status: "completed" }, [earlier])).toMatchObject({
      result: null,
      fulfillment: null,
      returnedDepth: null,
      cost: "conflict",
    });
    expect(
      projectCheckEvidence({ ...check, status: "completed" }, [
        earlier,
        { ...operation({ fulfillment: "partial", returnedDepth: 8 }), operationPk: "actual" },
      ]),
    ).toMatchObject({ result: "partial", returnedDepth: 8 });
  });
  it("uses restored provenance instead of a different attempt", () => {
    expect(
      projectCheckEvidence(
        {
          ...check,
          status: "completed",
          recoveryRestoredAt: new Date(),
          recoveryProvenance: { operationPk: "actual" },
        },
        [
          operation({ returnedDepth: 20 }),
          { ...operation({ returnedDepth: 100 }), operationPk: "actual" },
        ],
      ),
    ).toMatchObject({ result: "recovered", returnedDepth: 100 });
  });
  it("fails closed when more than one attempt could carry the result", () => {
    expect(
      projectCheckEvidence(check, [operation(), { ...operation(), operationPk: "other" }]),
    ).toMatchObject({ result: null });
  });
  it("preserves partial depth without a completed result", () => {
    expect(
      projectCheckEvidence(
        { ...check, partialEvidence: [{ kind: "partial", returnedDepth: 7 }] },
        [],
      ),
    ).toMatchObject({ result: "partial", returnedDepth: 7, accounting: null });
  });
  it("leaves legacy rows without evidence null", () => {
    expect(projectCheckEvidence(check, [])).toBeNull();
  });
  it("counts each result separately from cost conflict", () => {
    expect(
      projectionCounts([
        projectCheckEvidence(check, [
          operation({ fulfillment: "partial", accounting: "conflict" }),
        ]),
        null,
      ]),
    ).toMatchObject({ partial: 1, cost_conflict: 1, recovered: 0 });
  });
});

it("does not invent uncertainty from an unclassified not-needed marker", () => {
  expect(
    projectCheckEvidence({ ...check, status: "completed" }, [
      operation({
        acceptance: null,
        fulfillment: null,
        accounting: null,
        recoveryState: "not_needed",
      }),
    ]),
  ).toBeNull();
});

it("does not assume a lone retained identity is the winner of several attempts", () => {
  expect(
    projectCheckEvidence({ ...check, status: "completed", attemptCount: 2 }, [
      operation({ fulfillment: "complete", accounting: "measured" }),
    ]),
  ).toMatchObject({ result: null, fulfillment: null, cost: "measured" });
});
