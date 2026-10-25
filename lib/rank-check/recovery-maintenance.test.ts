import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { retainedRankResultMaintenanceWhere } from "./recovery-maintenance";
import { resultRecoveryCutoff } from "./recovery-result-grace";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/metering/recovery/tokens", () => ({ recoveryInstance: () => "test-instance" }));
vi.mock("@/lib/metering/runtime", () => ({ meteringNamespace: () => "test-namespace" }));
vi.mock("./recovery-evidence", () => ({ RetainedRankResultUnreadableError: class {} }));
vi.mock("./recovery-restore", () => ({ restoreRetainedRankResult: async () => false }));
vi.mock("./recovery-result-health", () => ({ saveResultRecoveryHealth: () => undefined }));

describe("retained result maintenance selector", () => {
  it("selects only unblocked retained rows and never the partial evidence store", () => {
    const now = new Date("2026-10-23T12:00:00.000Z");
    expect(
      retainedRankResultMaintenanceWhere({ instanceId: "inst", namespace: "ns" }, now),
    ).toEqual({
      blockedCode: null,
      createdAt: { lte: resultRecoveryCutoff(now) },
      expiresAt: { gt: now },
      instanceId: "inst",
      namespace: "ns",
    });
    const maintenance = readFileSync(new URL("./recovery-maintenance.ts", import.meta.url), "utf8");
    const restore = readFileSync(new URL("./recovery-restore.ts", import.meta.url), "utf8");
    expect(maintenance).toContain("rankCheckResultEvidence.findMany");
    expect(maintenance).not.toContain("providerPartialEvidence");
    expect(restore).not.toContain("providerPartialEvidence");
    expect(restore).toContain("recoveryResult: true");
  });
});
