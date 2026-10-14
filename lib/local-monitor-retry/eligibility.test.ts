import type { SubmissionRecord } from "@/lib/local-monitoring/execution-types";
import { hostRecord } from "@/lib/local-monitoring-host/host.test-fixture";
import { describe, expect, it } from "vitest";
import { monitorRetryEligibility } from "./eligibility";

function rejected(): SubmissionRecord {
  const record = hostRecord();
  return {
    ...record,
    status: "rejected",
    outcome: record.outcome
      ? {
          ...record.outcome,
          acceptance: "rejected",
          taskIds: [],
          usage: { cached: false, costCents: 0, quantity: 0, failed: true },
        }
      : null,
  };
}
describe("original native retry eligibility", () => {
  it("requires native exhaustive rejection plus completed settlement and released owner", () => {
    const record = rejected();
    expect(
      monitorRetryEligibility({
        record,
        financialState: "settled",
        ownerRetained: false,
        nativeProof: "proven_rejected",
      }),
    ).toEqual({ eligible: true, reason: "eligible_rejected" });
    for (const override of [
      { nativeProof: null },
      { financialState: "reserved" as const },
      { ownerRetained: true },
    ])
      expect(
        monitorRetryEligibility({
          record,
          financialState: "settled",
          ownerRetained: false,
          nativeProof: "proven_rejected",
          ...override,
        }).eligible,
      ).toBe(false);
  });
  it("retains settled canonical no-send without requiring RELEASED or clearing attempt usage", () => {
    const record: SubmissionRecord = {
      ...rejected(),
      status: "cancelled",
      outcome: null,
      settlementRecorded: false,
    };
    for (const financialState of ["settled", "released"] as const)
      expect(
        monitorRetryEligibility({
          record,
          financialState,
          ownerRetained: false,
          nativeProof: "proven_unsent",
        }),
      ).toEqual({ eligible: true, reason: "eligible_unsent" });
  });
  it("never buys accepted, unknown or historically accepted IDs even when another label claims failure", () => {
    const accepted = hostRecord();
    const samples: SubmissionRecord[] = [
      accepted,
      { ...rejected(), status: "unknown_acceptance" },
      { ...rejected(), originalOutcome: accepted.outcome },
      { ...rejected(), outcome: accepted.outcome },
    ];
    for (const record of samples)
      expect(
        monitorRetryEligibility({
          record,
          financialState: "settled",
          ownerRetained: false,
          nativeProof: "proven_rejected",
        }).eligible,
      ).toBe(false);
  });
  it("does not let reconciliation or retained native ownership become a checkbox approval", () => {
    expect(
      monitorRetryEligibility({
        record: { ...rejected(), pendingReconciliationReason: "collected_scope_conflict" },
        financialState: "settled",
        ownerRetained: false,
        nativeProof: "proven_rejected",
      }).reason,
    ).toBe("reconciliation_pending");
  });
});
