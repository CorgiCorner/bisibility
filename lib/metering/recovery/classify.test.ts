import { describe, expect, it } from "vitest";
import { classifyRecoveryRecord, recoveryBasis } from "./classify";
import type { RecoveryRecord } from "./records";
import { openRecoveryCase } from "./tokens";

const scope = { actor: "admin", namespace: "test", instance: "test-instance" };
const now = new Date("2026-10-13T10:00:00Z");
const record = (overrides: Partial<RecoveryRecord> = {}): RecoveryRecord => ({
  key: "operation:original",
  kind: "operation",
  id: "original",
  namespace: "test",
  version: 1,
  provider: "dataforseo",
  feature: "rank_check",
  funding: "byok",
  projectId: "private-project",
  projectPublicId: "prj_public",
  connectionId: "private-connection",
  connectionPublicId: "conn_public",
  rankCheckId: "private-check",
  runId: null,
  rankStatus: "failed",
  rankUpdatedAt: now,
  projectExists: true,
  historical: false,
  accountingUnknown: true,
  nativeId: null,
  binding: true,
  fenced: false,
  state: "dispatch_intended",
  leaseExpiresAt: new Date("2026-08-01T00:00:00Z"),
  createdAt: new Date("2026-08-01T00:00:00Z"),
  receipt: {
    cost: { certainty: "unknown", money: null },
    measurements: [{ unit: "units", certainty: "unknown", quantity: null }],
  },
  proof: false,
  resultExpiresAt: null,
  error: null,
  activeError: false,
  triageVersion: null,
  triageBasis: null,
  triageStatus: null,
  triageReason: null,
  assigneeId: null,
  snoozedUntil: null,
  ...overrides,
});
describe("independent recovery facts", () => {
  it("never infers no-send from an expired unfenced intent, missing ID or age", () => {
    const value = classifyRecoveryRecord(record(), scope, now);
    expect(value.send).toBe("unknown");
    expect(value.accounting).toBe("unknown");
    expect(value.action).toBeNull();
    expect(value.blockedReason).toBe("proof_missing");
  });
  it("keeps delivered work and unknown cost separate", () => {
    const value = classifyRecoveryRecord(
      record({ rankStatus: "completed", nativeId: "private-native", proof: true }),
      scope,
      now,
    );
    expect(value).toMatchObject({
      work: "completed",
      send: "accepted",
      accounting: "unknown",
      action: "recover_proof",
    });
    expect(value.unknownDimensions).toEqual(["provider_cost", "units"]);
    expect(JSON.stringify(value)).not.toMatch(/private-(project|connection|native|check)/);
    expect(openRecoveryCase(value.token, scope)).toMatchObject({
      kind: "operation",
      id: "original",
    });
  });
  it("does not reopen acknowledgement for the same automatic failure repeating", () => {
    const row = record({
      error: { code: "native_identity_conflict", attempts: 1, failedAt: now.toISOString() },
    });
    row.triageBasis = recoveryBasis(row);
    row.triageStatus = "acknowledged";
    row.triageVersion = 1;
    expect(
      classifyRecoveryRecord(
        { ...row, error: { code: "native_identity_conflict", attempts: 9 } },
        scope,
        now,
      ).triage.status,
    ).toBe("acknowledged");
    expect(
      classifyRecoveryRecord(
        { ...row, error: { code: "store_unavailable", attempts: 10 } },
        scope,
        now,
      ).triage.status,
    ).toBe("open");
  });
  it("keeps snooze operational and expires it without changing financial truth", () => {
    const row = record({
      triageStatus: "waiting_evidence",
      snoozedUntil: new Date(now.getTime() + 60000),
    });
    expect(classifyRecoveryRecord(row, scope, now)).toMatchObject({
      accounting: "unknown",
      triage: { status: "waiting_evidence" },
    });
    expect(classifyRecoveryRecord(row, scope, new Date(now.getTime() + 60001)).triage.status).toBe(
      "open",
    );
  });
  it("never grants new customer spending from a system-admin case", () => {
    expect(
      classifyRecoveryRecord(
        record({ kind: "run", state: "queued", binding: false, rankCheckId: null }),
        scope,
        now,
      ),
    ).toMatchObject({ send: "not_started", action: null, blockedReason: "authorization_required" });
    expect(
      classifyRecoveryRecord(record({ funding: "platform", proof: false }), scope, now),
    ).toMatchObject({ action: null, blockedReason: "wallet_coordination_required" });
    expect(
      classifyRecoveryRecord(record({ funding: "platform", proof: true }), scope, now),
    ).toMatchObject({ action: "recover_proof" });
  });
  it("offers retained-result restoration without treating the cost as known", () => {
    expect(
      classifyRecoveryRecord(
        record({ resultExpiresAt: new Date(now.getTime() + 60000) }),
        scope,
        now,
      ),
    ).toMatchObject({ action: "restore_result", accounting: "unknown", work: "unfinished" });
  });
});
