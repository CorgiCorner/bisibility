import { beforeEach, describe, expect, it, vi } from "vitest";
import { getIngestHooks } from "./ingest-hooks";

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  getRequestProjectDefaults: vi.fn(),
  requireReadableProject: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: { ingestHook: { findMany: mocks.findMany } },
}));
vi.mock("./_auth", () => ({ requireReadableProject: mocks.requireReadableProject }));
vi.mock("./workspace-request-data", () => ({
  getRequestProjectDefaults: mocks.getRequestProjectDefaults,
}));

describe("getIngestHooks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireReadableProject.mockResolvedValue({ project: { id: "project_1" } });
    mocks.getRequestProjectDefaults.mockResolvedValue({ timezone: "Europe/Madrid" });
    mocks.findMany.mockResolvedValue([
      {
        createdAt: new Date("2026-05-01T23:30:00.000Z"),
        disabled: false,
        label: "Deploy hook",
        lastUsedAt: null,
        publicId: "hook_abcdefghijklmnopqrstuvwx",
      },
    ]);
  });

  it("formats hook dates in the project timezone", async () => {
    await expect(getIngestHooks("prj_1", { dateFormat: "long" })).resolves.toEqual([
      expect.objectContaining({
        createdLabel: "created May 2, 2026",
        lastUsedLabel: "last used never",
      }),
    ]);
    expect(mocks.getRequestProjectDefaults).toHaveBeenCalledWith("project_1");
  });
});
