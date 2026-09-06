import { beforeEach, describe, expect, it, vi } from "vitest";
import { setExperimentalModules } from "./experimental-modules";

const projectId = "prj_abcdefghijklmnopqrstuvwx";
const mocks = vi.hoisted(() => ({
  getActionActor: vi.fn(),
  prisma: {
    projectDefaults: { findUnique: vi.fn(), upsert: vi.fn() },
  },
  requireProjectScope: vi.fn(),
  revalidateExperimentalModuleViews: vi.fn(),
  writeAudit: vi.fn(),
}));

vi.mock("@/lib/actions/_shared", () => ({
  getActionActor: mocks.getActionActor,
  parseActionInput: (schema: { parse: (input: unknown) => unknown }, input: unknown) =>
    schema.parse(input),
  requireProjectScope: mocks.requireProjectScope,
  revalidateExperimentalModuleViews: mocks.revalidateExperimentalModuleViews,
}));
vi.mock("@/lib/auth/audit", () => ({ writeAudit: mocks.writeAudit }));
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));

describe("setExperimentalModules", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getActionActor.mockResolvedValue({ id: "user_1" });
    mocks.requireProjectScope.mockResolvedValue({ id: "project_1", publicId: projectId });
    mocks.prisma.projectDefaults.findUnique.mockResolvedValue({
      enabledExperimentalModules: ["timeline", "unknown"],
    });
    mocks.prisma.projectDefaults.upsert.mockResolvedValue({
      enabledExperimentalModules: ["competitors", "unavailable"],
    });
  });

  it("upserts only the enabled set, audits normalized values, and revalidates module views", async () => {
    await expect(
      setExperimentalModules({ enabledExperimentalModules: ["competitors"], projectId }),
    ).resolves.toEqual({ enabledExperimentalModules: ["competitors"] });

    expect(mocks.requireProjectScope).toHaveBeenCalledWith({ id: "user_1" }, "update", projectId, {
      type: "project_defaults",
    });
    expect(mocks.prisma.projectDefaults.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: { enabledExperimentalModules: ["competitors"], projectId: "project_1" },
        update: { enabledExperimentalModules: ["competitors"] },
        where: { projectId: "project_1" },
      }),
    );
    expect(mocks.writeAudit).toHaveBeenCalledWith({
      action: "settings.experimental_modules.update",
      actorId: "user_1",
      after: { enabledExperimentalModules: ["competitors"] },
      before: { enabledExperimentalModules: ["timeline"] },
      projectId: "project_1",
      targetId: projectId,
      targetType: "project_defaults",
    });
    expect(mocks.revalidateExperimentalModuleViews).toHaveBeenCalledOnce();
  });

  it("rejects unauthorized requests before persistence or audit", async () => {
    mocks.requireProjectScope.mockRejectedValue(new Error("forbidden"));

    await expect(
      setExperimentalModules({ enabledExperimentalModules: ["timeline"], projectId }),
    ).rejects.toThrow("forbidden");

    expect(mocks.prisma.projectDefaults.upsert).not.toHaveBeenCalled();
    expect(mocks.writeAudit).not.toHaveBeenCalled();
  });

  it("rejects unknown input before authorization, persistence, or audit", async () => {
    await expect(
      setExperimentalModules({ enabledExperimentalModules: ["unknown"], projectId }),
    ).rejects.toThrow();

    expect(mocks.getActionActor).not.toHaveBeenCalled();
    expect(mocks.requireProjectScope).not.toHaveBeenCalled();
    expect(mocks.prisma.projectDefaults.upsert).not.toHaveBeenCalled();
    expect(mocks.writeAudit).not.toHaveBeenCalled();
  });
});
