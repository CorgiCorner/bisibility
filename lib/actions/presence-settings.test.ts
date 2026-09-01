import { beforeEach, describe, expect, it, vi } from "vitest";
import { updatePresenceInspectionBudget, updateSearchSyncSettings } from "./presence-settings";

const PROJECT_PUBLIC_ID = "prj_abcdefghijklmnopqrstuvwx";
const mocks = vi.hoisted(() => ({
  getActionActor: vi.fn(),
  prisma: {
    $transaction: vi.fn(),
    projectDefaults: { findUnique: vi.fn(), upsert: vi.fn() },
  },
  replanActiveGscBackfill: vi.fn(),
  requireProjectScope: vi.fn(),
  revalidateSettingsViews: vi.fn(),
  writeAudit: vi.fn(),
  tx: {
    projectDefaults: { upsert: vi.fn() },
  },
}));

vi.mock("./_shared", () => ({
  getActionActor: mocks.getActionActor,
  parseActionInput: (_schema: unknown, input: unknown) => input,
  requireProjectScope: mocks.requireProjectScope,
  revalidateSettingsViews: mocks.revalidateSettingsViews,
}));
vi.mock("@/lib/auth/audit", () => ({
  requiredPublicAuditId: (value: string) => value,
  writeAudit: mocks.writeAudit,
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/search-insights/sync/backfill-plan", () => ({
  replanActiveGscBackfill: mocks.replanActiveGscBackfill,
}));

function defaults(inspectionDailyLimit: number) {
  return {
    city: null,
    country: "Poland",
    createdAt: new Date("2026-07-27T10:00:00.000Z"),
    cronExpression: null,
    device: "desktop",
    frequency: "daily",
    id: "defaults_1",
    inspectionDailyLimit,
    jitterMinutes: 60,
    lastCheckedAt: null,
    locationKey: "PL",
    nextCheckAt: null,
    projectId: "project_1",
    serpDepth: 100,
    serpStopOnMatch: true,
    timezone: "Europe/Warsaw",
    updatedAt: new Date("2026-07-27T11:00:00.000Z"),
  };
}

describe("presence settings actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getActionActor.mockResolvedValue({ id: "user_1" });
    mocks.requireProjectScope.mockResolvedValue({
      id: "project_1",
      publicId: PROJECT_PUBLIC_ID,
    });
    mocks.prisma.projectDefaults.findUnique.mockResolvedValue(defaults(50));
    mocks.prisma.projectDefaults.upsert.mockResolvedValue(defaults(80));
    mocks.tx.projectDefaults.upsert.mockResolvedValue(defaults(80));
    mocks.prisma.$transaction.mockImplementation((callback) => callback(mocks.tx));
  });

  it("returns and audits configuration without ProjectDefaults storage fields", async () => {
    const result = await updatePresenceInspectionBudget({
      inspectionDailyLimit: 80,
      projectId: PROJECT_PUBLIC_ID,
    });

    expect(result).toMatchObject({
      inspectionDailyLimit: 80,
      projectId: PROJECT_PUBLIC_ID,
    });
    expect(result).not.toHaveProperty("id");
    expect(result).not.toHaveProperty("createdAt");
    expect(result).not.toHaveProperty("updatedAt");
    expect(JSON.stringify(result)).not.toContain("project_1");
    expect(mocks.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        after: expect.objectContaining({ inspectionDailyLimit: 80 }),
        before: expect.objectContaining({ inspectionDailyLimit: 50 }),
        targetId: PROJECT_PUBLIC_ID,
        targetType: "project_defaults",
      }),
    );
    const audit = mocks.writeAudit.mock.calls[0]?.[0];
    expect(audit?.after).not.toHaveProperty("id");
    expect(audit?.after).not.toHaveProperty("projectId");
    expect(audit?.before).not.toHaveProperty("createdAt");
    expect(audit?.before).not.toHaveProperty("updatedAt");
  });

  it("locks and re-plans the active GSC import before saving search sync settings", async () => {
    mocks.tx.projectDefaults.upsert.mockResolvedValue({
      ...defaults(80),
      searchSyncImportMonths: 16,
      searchSyncPace: "normal",
    });

    await updateSearchSyncSettings({
      pace: "normal",
      projectId: PROJECT_PUBLIC_ID,
      retentionMonths: 16,
    });

    expect(mocks.replanActiveGscBackfill).toHaveBeenCalledWith(
      { projectId: "project_1", retentionMonths: 16 },
      mocks.tx,
    );
    expect(mocks.replanActiveGscBackfill.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.tx.projectDefaults.upsert.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY,
    );
  });

  it("re-plans before committing the saved settings transaction", async () => {
    let transactionComplete = false;
    mocks.prisma.$transaction.mockImplementation(async (callback) => {
      const result = await callback(mocks.tx);
      transactionComplete = true;
      return result;
    });
    mocks.replanActiveGscBackfill.mockImplementation(async (_input, client) => {
      expect(client).toBe(mocks.tx);
      expect(transactionComplete).toBe(false);
    });

    await updateSearchSyncSettings({
      pace: "normal",
      projectId: PROJECT_PUBLIC_ID,
      retentionMonths: 16,
    });

    expect(transactionComplete).toBe(true);
  });
});
