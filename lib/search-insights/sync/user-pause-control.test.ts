import { beforeEach, describe, expect, it, vi } from "vitest";
import { transitionActiveSearchImport } from "./user-pause-control";

const mocks = vi.hoisted(() => ({
  audit: vi.fn(),
  resolveConnection: vi.fn(),
  startBackfill: vi.fn(),
  transaction: vi.fn(),
  tx: { searchAnalyticsImport: { findUnique: vi.fn(), update: vi.fn() } },
}));
vi.mock("@/lib/auth/audit", () => ({ writeAudit: mocks.audit }));
vi.mock("@/lib/db/prisma", () => ({ prisma: { $transaction: mocks.transaction } }));
vi.mock("@/lib/temporal/search-insights-client", () => ({
  startSearchInsightsBackfillWorkflow: mocks.startBackfill,
}));
vi.mock("./credentials", () => ({ resolveSearchInsightsConnection: mocks.resolveConnection }));

const base = {
  actorId: "user_1",
  projectId: "project_1",
  projectPublicId: "prj_1",
};
const row = {
  cursorDate: new Date("2026-07-01"),
  earliestTargetDate: new Date("2025-03-01"),
  id: "import_1",
  pauseStartedAt: null,
  pausedById: null,
  pausedReason: null,
  property: "sc-domain:example.com",
  state: "running",
};

describe("transitionActiveSearchImport", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveConnection.mockResolvedValue({ property: row.property });
    mocks.transaction.mockImplementation((work) => work(mocks.tx));
    mocks.tx.searchAnalyticsImport.findUnique.mockResolvedValue(row);
    mocks.tx.searchAnalyticsImport.update.mockImplementation(({ data }) => ({ ...row, ...data }));
  });

  it("atomically pauses with actor and append-only audit", async () => {
    await transitionActiveSearchImport({ ...base, transition: "pause" });
    expect(mocks.tx.searchAnalyticsImport.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          pausedById: "user_1",
          pausedReason: "user",
          state: "paused",
        }),
      }),
    );
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "search_data_sync.pause",
        actorId: "user_1",
        after: expect.objectContaining({ reason: "user" }),
      }),
      mocks.tx,
    );
  });

  it("is idempotent for repeated pause and resume", async () => {
    mocks.tx.searchAnalyticsImport.findUnique.mockResolvedValue({
      ...row,
      pausedReason: "user",
      state: "paused",
    });
    await transitionActiveSearchImport({ ...base, transition: "pause" });
    expect(mocks.tx.searchAnalyticsImport.update).not.toHaveBeenCalled();
    mocks.tx.searchAnalyticsImport.findUnique.mockResolvedValue(row);
    await transitionActiveSearchImport({ ...base, transition: "resume" });
    expect(mocks.tx.searchAnalyticsImport.update).not.toHaveBeenCalled();
  });

  it.each([
    ["needs_reauth", "paused"],
    ["rate_limited", "paused"],
    ["error", "failed"],
  ])("rejects resume from %s without clearing the durable reason", async (pausedReason, state) => {
    mocks.tx.searchAnalyticsImport.findUnique.mockResolvedValue({ ...row, pausedReason, state });
    await expect(
      transitionActiveSearchImport({ ...base, transition: "resume" }),
    ).resolves.toMatchObject({ changed: false });
    expect(mocks.tx.searchAnalyticsImport.update).not.toHaveBeenCalled();
  });

  it("retries an error through the frozen gap-fill plan", async () => {
    mocks.tx.searchAnalyticsImport.findUnique.mockResolvedValue({
      ...row,
      lastError: "safe",
      lastErrorClass: "provider",
      pausedReason: "error",
      state: "failed",
    });
    await transitionActiveSearchImport({ ...base, transition: "retry" });
    const data = mocks.tx.searchAnalyticsImport.update.mock.calls[0]?.[0].data;
    expect(data).toMatchObject({ lastError: null, pausedReason: null, state: "queued" });
    expect(data).not.toHaveProperty("cursorDate");
    expect(data).not.toHaveProperty("earliestTargetDate");
    expect(mocks.startBackfill).not.toHaveBeenCalled();
  });

  it("resumes the frozen cursor without resetting plan depth", async () => {
    mocks.tx.searchAnalyticsImport.findUnique.mockResolvedValue({
      ...row,
      pausedReason: "user",
      state: "paused",
    });
    await transitionActiveSearchImport({ ...base, transition: "resume" });
    const data = mocks.tx.searchAnalyticsImport.update.mock.calls[0]?.[0].data;
    expect(data).toMatchObject({ pausedReason: null, state: "queued" });
    expect(data).not.toHaveProperty("cursorDate");
    expect(data).not.toHaveProperty("earliestTargetDate");
    expect(data).not.toHaveProperty("workflowId");
    expect(mocks.startBackfill).not.toHaveBeenCalled();
  });
});
