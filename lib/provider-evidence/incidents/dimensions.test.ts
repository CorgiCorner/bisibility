import { describe, expect, it } from "vitest";
import { incidentCause } from "./cause";
import {
  aggregateIncident,
  customerDimensions,
  type IncidentDimensions,
  operationResolved,
} from "./dimensions";

const resolved: IncidentDimensions = {
  acceptance: "accepted",
  fulfillment: "complete",
  accounting: "measured",
  exhaustionStatus: "not_applicable",
  exhaustionReason: null,
};
describe("incident customer dimensions", () => {
  it("uses only canonical provider and Meter feature as cause", () => {
    expect(incidentCause({ provider: "dataforseo", operation: "rank_check" })).toBe(
      "dataforseo:rank_check",
    );
    expect(() =>
      incidentCause({ provider: "customer@example.test", operation: "rank_check" }),
    ).toThrow();
    expect(() => incidentCause({ provider: "dataforseo", operation: "" })).toThrow();
  });
  it("requires known acceptance, terminal fulfillment and settled accounting", () => {
    expect(operationResolved(resolved)).toBe(true);
    for (const acceptance of ["unconfirmed", null] as const)
      expect(operationResolved({ ...resolved, acceptance })).toBe(false);
    for (const fulfillment of ["pending", "absent", null] as const)
      expect(operationResolved({ ...resolved, fulfillment })).toBe(false);
    for (const fulfillment of ["complete", "partial", "provider_error"] as const)
      for (const acceptance of ["accepted", "rejected"] as const)
        expect(operationResolved({ ...resolved, fulfillment, acceptance })).toBe(true);
    expect(operationResolved({ ...resolved, accounting: "conflict" })).toBe(false);
  });
  it("finally unknown needs exhausted status and a nonempty persisted reason", () => {
    const value = {
      ...resolved,
      accounting: "unknown" as const,
      exhaustionReason: "retention_expired",
    };
    expect(operationResolved({ ...value, exhaustionStatus: "pending" })).toBe(false);
    expect(operationResolved({ ...value, exhaustionStatus: "exhausted" })).toBe(true);
    for (const exhaustionReason of [null, "", "  "])
      expect(operationResolved({ ...value, exhaustionStatus: "exhausted", exhaustionReason })).toBe(
        false,
      );
  });
  it.each([
    [null, "resultUnderReviewCount"],
    ["pending", "resultUnderReviewCount"],
    ["complete", "resultRecoveredCount"],
    ["partial", "resultPartialCount"],
    ["provider_error", "resultProviderErrorCount"],
    ["absent", "resultMissingCount"],
  ] as const)("projects result %s independently from cost", (fulfillment, result) => {
    expect(customerDimensions({ ...resolved, fulfillment, accounting: "conflict" })).toEqual({
      result,
      cost: "costUnderReviewCount",
    });
  });
  it("unknown remains under review until exhaustion; counts never collapse to one state", () => {
    expect(
      customerDimensions({ ...resolved, accounting: "unknown", exhaustionStatus: "pending" }).cost,
    ).toBe("costUnderReviewCount");
    expect(
      customerDimensions({
        ...resolved,
        accounting: "unknown",
        exhaustionStatus: "exhausted",
        exhaustionReason: "expired",
      }).cost,
    ).toBe("costUnknownCount");
    expect(aggregateIncident([resolved, { ...resolved, acceptance: "unconfirmed" }])).toMatchObject(
      { resolved: false, counts: { resultRecoveredCount: 2, costMeasuredCount: 2 } },
    );
    expect(aggregateIncident([]).resolved).toBe(false);
  });
});
