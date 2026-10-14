import { describe, expect, it } from "vitest";
import { hostRecord } from "./host.test-fixture";
import { projectLocalHostItem } from "./projection";

describe("separate acceptance, finance and ownership evidence", () => {
  it("does not make known accepted tasks financially settled", () => {
    const record = { ...hostRecord(), collectedEvidenceId: "synthetic-observation" };
    expect(projectLocalHostItem(record, "pending", true)).toMatchObject({
      resolution: "accounting_pending",
      accountingPending: true,
      ownerRetained: true,
    });
  });
  it("does not make settled native finance prove exhaustive acceptance", () => {
    const record = hostRecord();
    const partial = {
      ...record,
      status: "unknown_acceptance" as const,
      outcome: { ...record.outcome!, acceptance: "unknown" as const },
    };
    expect(projectLocalHostItem(partial, "settled", true)).toMatchObject({
      resolution: "needs_provider_evidence",
      accountingPending: false,
      knownAcceptedTaskCount: 1,
    });
  });
  it("requires proven accepted tasks to be collected and original owner released", () => {
    const record = hostRecord();
    const collected = { ...record, collectedEvidenceId: "synthetic-observation" };
    expect(projectLocalHostItem(collected, "settled", true).resolution).toBe(
      "owner_release_pending",
    );
    expect(projectLocalHostItem(collected, "settled", false).resolution).toBe("complete");
  });
  it("does not clear a collected subset conflict from terminal-looking money", () => {
    const original = hostRecord();
    const record = {
      ...original,
      status: "unknown_acceptance" as const,
      outcome: { ...original.outcome!, acceptance: "unknown" as const },
      pendingReconciliationReason: "collected_scope_conflict" as const,
      collectedEvidenceId: "synthetic-observation",
    };
    expect(projectLocalHostItem(record, "settled", true).resolution).toBe("pending_reconciliation");
  });
  it("permits only proven undispatched released cancellation, never possible-send cancellation", () => {
    const cancelled = {
      ...hostRecord(),
      status: "cancelled" as const,
      attemptId: null,
      outcome: null,
      settlementRecorded: false,
      cancellationRequested: true,
    };
    expect(projectLocalHostItem(cancelled, "released", true).resolution).toBe(
      "owner_release_pending",
    );
  });
  it("keeps absent execution or canonical state explicitly unavailable", () => {
    expect(projectLocalHostItem(hostRecord(), "unavailable", true).resolution).toBe("unavailable");
    expect(projectLocalHostItem(hostRecord(), "unavailable", true).accountingPending).toBeNull();
  });
  it("keeps verified native no-send settlement terminal without relabelling its financial state", () => {
    const cancelled = {
      ...hostRecord(),
      status: "cancelled" as const,
      outcome: null,
      settlementRecorded: false,
      cancellationRequested: true,
      collectedEvidenceId: null,
    };
    expect(projectLocalHostItem(cancelled, "settled", false)).toMatchObject({
      financialState: "settled",
      resolution: "cancelled",
      accountingPending: false,
    });
  });
  it("returns no native receipt, task IDs, provider identity or metadata key", () => {
    const json = JSON.stringify(projectLocalHostItem(hostRecord(), "settled", true));
    expect(json).not.toMatch(
      /synthetic-original-native|00000000-|costCents|credential|targetKey|operationKey|local-submit-proof/,
    );
  });
});
