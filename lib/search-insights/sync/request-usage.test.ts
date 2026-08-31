import { accountSearchAnalyticsRequests } from "@/lib/search-insights/sync/request-usage";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ create: vi.fn(), fetch: vi.fn(), update: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({
  prisma: { searchAnalyticsRequestUsage: { create: mocks.create, update: mocks.update } },
}));
describe("accountSearchAnalyticsRequests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.create.mockResolvedValue({ id: "req_1" });
    mocks.update.mockResolvedValue({});
    mocks.fetch.mockResolvedValue({ rows: [] });
  });
  it("records one attempted call even when the provider rejects it", async () => {
    mocks.fetch.mockRejectedValue(new Error("429"));
    const session = accountSearchAnalyticsRequests({
      operation: "probe",
      projectId: "prj_1",
      property: "sc-domain:example.com",
      session: { property: "sc-domain:example.com", fetchEnvelope: mocks.fetch },
    });
    await expect(
      session.fetchEnvelope({ endDate: "2026-01-01", startDate: "2026-01-01" }),
    ).rejects.toThrow("429");
    expect(mocks.create).toHaveBeenCalledTimes(1);
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it("records every pagination fetch independently", async () => {
    const session = accountSearchAnalyticsRequests({
      operation: "dimensional",
      projectId: "prj_1",
      property: "sc-domain:example.com",
      session: { property: "sc-domain:example.com", fetchEnvelope: mocks.fetch },
    });
    await session.fetchEnvelope({ endDate: "2026-01-01", startDate: "2026-01-01", startRow: 0 });
    await session.fetchEnvelope({
      endDate: "2026-01-01",
      startDate: "2026-01-01",
      startRow: 25000,
    });
    expect(mocks.create.mock.calls.map(([call]) => call.data.startRow)).toEqual([0, 25000]);
    expect(mocks.update).toHaveBeenCalledTimes(2);
  });

  it("stores canonical request and response facts for an aggregate range", async () => {
    mocks.fetch.mockResolvedValue({ rows: Array.from({ length: 488 }, () => ({ keys: [] })) });
    const session = accountSearchAnalyticsRequests({
      operation: "aggregate",
      projectId: "prj_1",
      property: "sc-domain:example.com",
      session: { property: "sc-domain:example.com", fetchEnvelope: mocks.fetch },
    });
    await session.fetchEnvelope({
      dimensions: ["date"],
      endDate: "2026-07-07",
      rowLimit: 25000,
      startDate: "2025-03-07",
    });
    expect(mocks.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        dimensions: "date",
        endDate: new Date("2026-07-07T00:00:00Z"),
        rowLimit: 25000,
        startDate: new Date("2025-03-07T00:00:00Z"),
        startRow: 0,
      }),
    });
    expect(mocks.update).toHaveBeenCalledWith({
      data: { capHit: false, returnedRows: 488 },
      where: { id: "req_1" },
    });
  });

  it("records a freshness probe as one full-page-aware request", async () => {
    mocks.fetch.mockResolvedValue({ rows: Array.from({ length: 25000 }, () => ({ keys: [] })) });
    const session = accountSearchAnalyticsRequests({
      operation: "probe",
      projectId: "prj_1",
      property: "sc-domain:example.com",
      session: { property: "sc-domain:example.com", fetchEnvelope: mocks.fetch },
    });
    await session.fetchEnvelope({
      dimensions: ["date"],
      endDate: "2026-07-07",
      rowLimit: 25000,
      startDate: "2026-06-27",
    });
    expect(mocks.create).toHaveBeenCalledTimes(1);
    expect(mocks.update).toHaveBeenCalledWith({
      data: { capHit: true, returnedRows: 25000 },
      where: { id: "req_1" },
    });
  });
});
