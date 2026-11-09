import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  find: vi.fn(),
  update: vi.fn(),
  enabled: vi.fn(),
  access: vi.fn(),
  driver: vi.fn(),
}));
vi.mock("@/lib/scheduler/driver", async (original) => ({
  ...(await original<typeof import("@/lib/scheduler/driver")>()),
  schedulerDriver: mocks.driver,
}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: { siteAuditRun: { findFirst: mocks.find, updateMany: mocks.update } },
}));
vi.mock("@/lib/operations/access-extension", () => ({ assertOperationAccess: mocks.access }));
vi.mock("./worker-config", () => ({ siteAuditWorkerEnabled: mocks.enabled }));

import { cancelSiteAuditRun, resumeSiteAuditRun } from "./runs";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.enabled.mockResolvedValue(true);
  mocks.access.mockResolvedValue(undefined);
  mocks.driver.mockReturnValue("temporal");
  mocks.update.mockResolvedValue({ count: 1 });
});

describe("site audit run controls", () => {
  it("scopes cancellation to a project and ignores unknown runs", async () => {
    mocks.find.mockResolvedValue(null);
    expect(await cancelSiteAuditRun("project-a", "agr_example", { actorId: null })).toBeNull();
    expect(mocks.find).toHaveBeenCalledWith(
      expect.objectContaining({ where: { projectId: "project-a", publicId: "agr_example" } }),
    );
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it("does not resume while the flag is off", async () => {
    mocks.enabled.mockResolvedValue(false);
    await expect(resumeSiteAuditRun("project-a", "agr_example", { actorId: null })).rejects.toThrow(
      /disabled/i,
    );
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it("does not resume when operation access is denied", async () => {
    mocks.access.mockRejectedValue(new Error("access denied"));
    await expect(resumeSiteAuditRun("project-a", "agr_example", { actorId: null })).rejects.toThrow(
      "access denied",
    );
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it("does not queue a resume when the scheduler is disabled", async () => {
    mocks.driver.mockReturnValue("none");
    await expect(
      resumeSiteAuditRun("project-a", "agr_example", { actorId: null }),
    ).rejects.toMatchObject({
      code: "scheduler_disabled",
    });
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
