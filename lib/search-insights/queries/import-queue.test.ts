import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ findFirst: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({
  prisma: { searchAnalyticsImport: { findFirst: mocks.findFirst } },
}));

const { readSearchImportQueueFacts } = await import("./import-queue");

describe("readSearchImportQueueFacts", () => {
  beforeEach(() => vi.clearAllMocks());

  it("does not query blockers for a non-queued import", async () => {
    await expect(
      readSearchImportQueueFacts({
        createdAt: new Date("2026-08-31T12:00:00.000Z"),
        id: "import_1",
        projectId: "project_1",
        state: "running",
      }),
    ).resolves.toBeNull();
    expect(mocks.findFirst).not.toHaveBeenCalled();
  });

  it("names the earlier import consuming shared project quota", async () => {
    mocks.findFirst.mockResolvedValue({ property: "sc-domain:example.com" });

    await expect(
      readSearchImportQueueFacts({
        createdAt: new Date("2026-08-31T12:00:00.000Z"),
        id: "import_2",
        projectId: "project_1",
        state: "queued",
      }),
    ).resolves.toEqual({ blockingPropertyLabel: "example.com" });
    expect(mocks.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: { not: "import_2" },
          projectId: "project_1",
          workflowId: { not: null },
        }),
      }),
    );
  });

  it("returns worker-pickup facts when no earlier import blocks", async () => {
    mocks.findFirst.mockResolvedValue(null);

    await expect(
      readSearchImportQueueFacts({
        createdAt: new Date("2026-08-31T12:00:00.000Z"),
        id: "import_1",
        projectId: "project_1",
        state: "queued",
      }),
    ).resolves.toEqual({});
  });
});
