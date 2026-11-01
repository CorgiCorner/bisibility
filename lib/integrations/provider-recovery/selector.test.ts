import { describe, expect, it } from "vitest";
import { selectConnectionRecovery } from "./selector";

const base = {
  accountState: "verified",
  incidents: [],
  unconfirmedRequests: 0,
  probeId: null,
  probeAvailable: true,
  nextCheckAt: null,
} as const;

describe("connection recovery selector", () => {
  it("keeps account and accounting blocks independent", () => {
    expect(selectConnectionRecovery({ ...base, unconfirmedRequests: 2 })).toMatchObject({
      state: "review",
      paused: true,
      reason: "accounting_review",
      accountVerified: true,
    });
    expect(
      selectConnectionRecovery({
        ...base,
        incidents: [{ reason: "provider_auth", scope: { kind: "account" } }],
      }),
    ).toMatchObject({
      state: "review",
      paused: true,
      reason: "provider_auth",
      accountVerified: false,
    });
  });
  it("uses typed evidence, preserves legacy billing and respects capability scope", () => {
    expect(selectConnectionRecovery({ ...base, accountState: "payment_required" }).reason).toBe(
      "provider_billing",
    );
    expect(
      selectConnectionRecovery({
        ...base,
        incidents: [
          {
            reason: "provider_account_restricted",
            scope: { kind: "capability", capability: "backlinks" },
          },
        ],
      }).paused,
    ).toBe(false);
    expect(
      selectConnectionRecovery({
        ...base,
        incidents: [
          {
            reason: "provider_account_restricted",
            scope: { kind: "capability", capability: "rank_check" },
          },
        ],
      }),
    ).toMatchObject({
      reason: "provider_account_restricted",
      scope: { kind: "capability", capability: "rank_check" },
    });
  });
  it("reports persisted progress and unsupported probes", () => {
    expect(
      selectConnectionRecovery({
        ...base,
        probeId: "probe",
        probeAvailable: false,
        nextCheckAt: "2026-11-01T00:00:00Z",
      }),
    ).toMatchObject({ checking: true, canCheck: false, nextCheckAt: null });
  });
});
