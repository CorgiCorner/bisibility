import { beforeEach, describe, expect, it, vi } from "vitest";
import { transitionExactSearchImport } from "./user-pause-control";

const mocks = vi.hoisted(() => ({
  audit: vi.fn(),
  decrypt: vi.fn(),
  readCredentials: vi.fn(),
  transaction: vi.fn(),
  tx: {
    project: { findUnique: vi.fn() },
    providerConnection: { findUnique: vi.fn() },
    searchAnalyticsImport: { findFirst: vi.fn(), updateMany: vi.fn() },
  },
}));
vi.mock("@/lib/auth/audit", () => ({ writeAudit: mocks.audit }));
vi.mock("@/lib/db/prisma", () => ({ prisma: { $transaction: mocks.transaction } }));
vi.mock("@/lib/deployment/project-write-mode", () => ({
  isProjectReadOnly: (writeMode: string) => writeMode !== "active",
}));
vi.mock("@/lib/providers/crypto", () => ({ decryptProviderCredentials: mocks.decrypt }));
vi.mock("@/lib/providers/analytics/gsc-credentials", () => ({
  readGscCredentials: mocks.readCredentials,
}));

const target = {
  actorId: "user_1",
  importId: "import_a",
  projectId: "project_1",
  property: "sc-domain:a.example.com",
};
const row = {
  cursorDate: new Date("2026-07-01"),
  earliestTargetDate: new Date("2025-03-01"),
  id: target.importId,
  pauseStartedAt: null,
  pausedById: null,
  pausedReason: null,
  property: target.property,
  source: "gsc",
  state: "running",
};

describe("transitionExactSearchImport", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.transaction.mockImplementation((work) => work(mocks.tx));
    mocks.tx.project.findUnique.mockResolvedValue({ id: target.projectId, writeMode: "active" });
    mocks.tx.providerConnection.findUnique.mockResolvedValue({
      credentialsEncrypted: "encrypted",
      enabled: true,
      status: "connected",
    });
    mocks.decrypt.mockReturnValue({ login: target.property });
    mocks.readCredentials.mockReturnValue({ property: target.property });
    mocks.tx.searchAnalyticsImport.findFirst.mockResolvedValue(row);
    mocks.tx.searchAnalyticsImport.updateMany.mockResolvedValue({ count: 1 });
  });

  it("pauses only the frozen import identity and audits that exact row", async () => {
    await expect(transitionExactSearchImport({ ...target, transition: "pause" })).resolves.toEqual({
      changed: true,
      state: "paused",
    });

    expect(mocks.tx.searchAnalyticsImport.findFirst).toHaveBeenCalledWith({
      where: { id: target.importId, projectId: target.projectId, source: "gsc" },
    });
    expect(mocks.tx.searchAnalyticsImport.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: target.importId,
          pausedReason: null,
          projectId: target.projectId,
          property: target.property,
          source: "gsc",
          state: "running",
        }),
      }),
    );
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "search_data_sync.pause",
        actorId: target.actorId,
        projectId: target.projectId,
        targetId: target.importId,
      }),
      mocks.tx,
    );
  });

  it("rejects an archived A target after active property B replaces it", async () => {
    mocks.readCredentials.mockReturnValue({ property: "sc-domain:b.example.com" });

    await expect(transitionExactSearchImport({ ...target, transition: "pause" })).resolves.toEqual({
      changed: false,
      state: "unavailable",
    });
    expect(mocks.tx.searchAnalyticsImport.updateMany).not.toHaveBeenCalled();
  });

  it("rejects a property switch that occurs after the client rendered", async () => {
    mocks.tx.searchAnalyticsImport.findFirst.mockResolvedValue({
      ...row,
      property: "sc-domain:b.example.com",
    });

    await expect(transitionExactSearchImport({ ...target, transition: "pause" })).resolves.toEqual({
      changed: false,
      state: "unavailable",
    });
    expect(mocks.tx.searchAnalyticsImport.updateMany).not.toHaveBeenCalled();
  });

  it("rejects a stale concurrent transition when the conditional write no longer matches", async () => {
    mocks.tx.searchAnalyticsImport.updateMany.mockResolvedValue({ count: 0 });

    await expect(transitionExactSearchImport({ ...target, transition: "pause" })).resolves.toEqual({
      changed: false,
      state: "unavailable",
    });
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it.each(["migration_hold", "migrated"])(
    "rejects %s write mode without writing",
    async (writeMode) => {
      mocks.tx.project.findUnique.mockResolvedValueOnce({
        id: target.projectId,
        writeMode,
      });
      await expect(
        transitionExactSearchImport({ ...target, transition: "pause" }),
      ).resolves.toEqual({
        changed: false,
        state: "unavailable",
      });

      expect(mocks.tx.searchAnalyticsImport.updateMany).not.toHaveBeenCalled();
    },
  );

  it("rejects disconnected capability without writing", async () => {
    mocks.tx.project.findUnique.mockResolvedValue({ id: target.projectId, writeMode: "active" });

    mocks.tx.providerConnection.findUnique.mockResolvedValue({
      credentialsEncrypted: "encrypted",
      enabled: false,
      status: "connected",
    });
    await expect(transitionExactSearchImport({ ...target, transition: "pause" })).resolves.toEqual({
      changed: false,
      state: "unavailable",
    });
    expect(mocks.tx.searchAnalyticsImport.updateMany).not.toHaveBeenCalled();
  });

  it.each([
    ["resume", { pausedReason: "user", state: "paused" }, "queued"],
    ["retry", { pausedReason: "error", state: "failed" }, "queued"],
  ] as const)(
    "allows exact %s only from its capability state",
    async (transition, current, state) => {
      mocks.tx.searchAnalyticsImport.findFirst.mockResolvedValue({ ...row, ...current });

      await expect(transitionExactSearchImport({ ...target, transition })).resolves.toEqual({
        changed: true,
        state,
      });
    },
  );
});
