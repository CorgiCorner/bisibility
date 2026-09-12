import { beforeEach, describe, expect, it, vi } from "vitest";
import { getDemoResearchAccess } from "./demo-research";

const mocks = vi.hoisted(() => ({
  actor: vi.fn(),
  configured: vi.fn(),
  editable: vi.fn(),
  readable: vi.fn(),
}));

vi.mock("@/lib/demo/research-storage", () => ({
  isEditableDemoResearchProject: mocks.editable,
}));
vi.mock("@/lib/demo/identity", () => ({ loadConfiguredDemoActor: mocks.configured }));
vi.mock("./_auth", () => ({
  getQueryActor: mocks.actor,
  requireReadableProjectFor: mocks.readable,
}));

describe("getDemoResearchAccess", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.actor.mockResolvedValue({ id: "user_1" });
    mocks.readable.mockResolvedValue({
      project: { id: "project_1", publicId: "prj_abcdefghijklmnopqrstuvwx" },
    });
    mocks.editable.mockReturnValue(true);
    mocks.configured.mockResolvedValue({ id: "user_1", kind: "viewer" });
  });

  it("uses central read authorization before resolving the configured Viewer", async () => {
    await expect(getDemoResearchAccess("prj_abcdefghijklmnopqrstuvwx")).resolves.toEqual({
      actorKind: "viewer",
      project: { id: "project_1", publicId: "prj_abcdefghijklmnopqrstuvwx" },
    });
    expect(mocks.readable).toHaveBeenCalledWith({ id: "user_1" }, "prj_abcdefghijklmnopqrstuvwx");
  });

  it("returns the configured Owner role without inferring it from project membership", async () => {
    mocks.configured.mockResolvedValue({ id: "user_1", kind: "owner" });

    await expect(getDemoResearchAccess("prj_abcdefghijklmnopqrstuvwx")).resolves.toMatchObject({
      actorKind: "owner",
    });
  });

  it("does not enable stored mode for an unconfigured actor or project", async () => {
    mocks.editable.mockReturnValue(false);
    await expect(getDemoResearchAccess("prj_abcdefghijklmnopqrstuvwx")).resolves.toBeNull();
    expect(mocks.configured).not.toHaveBeenCalled();

    mocks.editable.mockReturnValue(true);
    mocks.configured.mockResolvedValue(null);
    await expect(getDemoResearchAccess("prj_abcdefghijklmnopqrstuvwx")).resolves.toBeNull();
  });
});
