import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createMany: vi.fn(),
  findUnique: vi.fn(),
  observability: vi.fn(),
}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    notification: { createMany: mocks.createMany },
    searchAnalyticsImport: { findUnique: mocks.findUnique },
  },
}));
vi.mock("@/lib/search-insights/queries/import-observability-db", () => ({
  readImportObservability: mocks.observability,
}));
const { deliverSearchImportMilestone } = await import("./milestone-notifications");
const imported = {
  id: "imp_1",
  firstDataDate: new Date("2026-07-06"),
  firstDataDetectedAt: new Date("2026-07-08T10:00:00.000Z"),
  waitingForFirstDataAt: new Date("2026-07-07T10:00:00.000Z"),
  source: "gsc",
  state: "running",
  daysTotal: 93,
  plannedRetentionMonths: 3,
  earliestTargetDate: new Date("2026-05-01"),
  newestFinalizedDate: new Date("2026-07-28"),
  projectId: "project_1",
  property: "sc-domain:example.com",
  project: {
    ownerId: "owner_1",
    publicId: "prj_public",
    members: [{ userId: "owner_1" }, { userId: "member_1" }],
  },
};

describe("deliverSearchImportMilestone", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findUnique.mockResolvedValue(imported);
    mocks.observability.mockResolvedValue({ firstViewReady: true });
    mocks.createMany.mockResolvedValue({ count: 2 });
  });
  it("dedupes owner and members and creates one delivery per recipient and milestone", async () => {
    await expect(
      deliverSearchImportMilestone({ importId: "imp_1", milestone: "first_28" }),
    ).resolves.toEqual({ delivered: 2 });
    const call = mocks.createMany.mock.calls[0][0];
    expect(call.skipDuplicates).toBe(true);
    expect(call.data).toHaveLength(2);
    expect(new Set(call.data.map((row: { userId: string }) => row.userId))).toEqual(
      new Set(["owner_1", "member_1"]),
    );
    expect(call.data[0].payload.href).toBe("/app/prj_public/search-console");
  });
  it("delivers first_data only after a waiting import records its first durable day", async () => {
    await expect(
      deliverSearchImportMilestone({ importId: "imp_1", milestone: "first_data" }),
    ).resolves.toEqual({ delivered: 2 });

    const call = mocks.createMany.mock.calls[0][0];
    expect(call.skipDuplicates).toBe(true);
    expect(call.data[0]).toMatchObject({
      idempotencyKey: "search-import:imp_1:first_data",
      title: "Your site appeared in Google search - first data imported for example.com.",
    });
    expect(mocks.observability).not.toHaveBeenCalled();
  });

  it.each([
    { firstDataDate: null, firstDataDetectedAt: new Date("2026-07-08T10:00:00.000Z") },
    { firstDataDate: new Date("2026-07-06"), firstDataDetectedAt: null },
    { waitingForFirstDataAt: null },
  ])("rejects first_data until waiting and durable data are both recorded", async (fields) => {
    mocks.findUnique.mockResolvedValue({ ...imported, ...fields });

    await expect(
      deliverSearchImportMilestone({ importId: "imp_1", milestone: "first_data" }),
    ).resolves.toEqual({ delivered: 0 });
    expect(mocks.createMany).not.toHaveBeenCalled();
  });

  it("reports only newly created deliveries on partial retry and whole-activity repeat", async () => {
    mocks.createMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    await expect(
      deliverSearchImportMilestone({ importId: "imp_1", milestone: "first_28" }),
    ).resolves.toEqual({ delivered: 1 });
    await expect(
      deliverSearchImportMilestone({ importId: "imp_1", milestone: "first_28" }),
    ).resolves.toEqual({ delivered: 0 });
  });
  it("rejects first_28 unless exact durable readiness passes", async () => {
    mocks.observability.mockResolvedValue({ firstViewReady: false });
    await expect(
      deliverSearchImportMilestone({ importId: "imp_1", milestone: "first_28" }),
    ).resolves.toEqual({ delivered: 0 });
    expect(mocks.createMany).not.toHaveBeenCalled();
  });
  it.each([3, 6, 12, 16])("uses frozen %i-month retention in full notification", async (months) => {
    mocks.findUnique.mockResolvedValue({
      ...imported,
      state: "completed",
      plannedRetentionMonths: months,
    });
    await deliverSearchImportMilestone({ importId: "imp_1", milestone: "full" });
    expect(mocks.createMany.mock.calls[0][0].data[0].title).toContain(`${months} months`);
  });
});
