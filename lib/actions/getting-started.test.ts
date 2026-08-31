import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cookieStore: { get: vi.fn(), set: vi.fn() },
  getActionActor: vi.fn(),
  loadSetupContext: vi.fn(),
  requireProjectScope: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: async () => mocks.cookieStore }));
vi.mock("@/lib/actions/_shared", () => ({
  getActionActor: mocks.getActionActor,
  requireProjectScope: mocks.requireProjectScope,
}));
vi.mock("@/lib/queries/setup-context", () => ({ loadSetupContext: mocks.loadSetupContext }));

import { acknowledgeGettingStarted } from "./getting-started";

const projectRef = "prj_abcdefghijklmnopqrstuvwx";

describe("acknowledgeGettingStarted", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getActionActor.mockResolvedValue({ id: "user-1", memberships: [], role: "member" });
    mocks.requireProjectScope.mockResolvedValue({ id: "project-1", publicId: projectRef });
    mocks.cookieStore.get.mockReturnValue(undefined);
    mocks.loadSetupContext.mockResolvedValue({
      completedCheckCount: 1,
      inFlightBatch: null,
      keywordCount: 1,
      keywordIds: ["kw_abcdefghijklmnopqrstuvwx"],
      project: { exists: true, name: "Example", publicRef: projectRef },
      providerExists: true,
      schedule: { mode: "manual" },
    });
  });

  it("validates access and writes a SameSite=Lax acknowledgement", async () => {
    await acknowledgeGettingStarted({ projectRef });
    expect(mocks.requireProjectScope).toHaveBeenCalledWith(
      expect.objectContaining({ id: "user-1" }),
      "read",
      projectRef,
      { type: "project" },
      { allowReadOnly: true },
    );
    expect(mocks.cookieStore.set).toHaveBeenCalledWith(
      "getting-started-ack",
      expect.any(String),
      expect.objectContaining({ httpOnly: true, sameSite: "lax" }),
    );
  });

  it("rejects acknowledgement before setup is complete", async () => {
    mocks.loadSetupContext.mockResolvedValueOnce({
      completedCheckCount: 0,
      inFlightBatch: null,
      keywordCount: 1,
      keywordIds: ["kw_abcdefghijklmnopqrstuvwx"],
      project: { exists: true, name: "Example", publicRef: projectRef },
      providerExists: true,
      schedule: { mode: "manual" },
    });
    await expect(acknowledgeGettingStarted({ projectRef })).rejects.toThrow(
      "Setup is not complete.",
    );
    expect(mocks.cookieStore.set).not.toHaveBeenCalled();
  });

  it("rejects invalid and inaccessible project references before writing", async () => {
    await expect(acknowledgeGettingStarted({ projectRef: "project-1" })).rejects.toThrow();
    expect(mocks.requireProjectScope).not.toHaveBeenCalled();
    expect(mocks.cookieStore.set).not.toHaveBeenCalled();

    mocks.requireProjectScope.mockRejectedValueOnce(new Error("Project not found."));
    await expect(acknowledgeGettingStarted({ projectRef })).rejects.toThrow("Project not found.");
    expect(mocks.cookieStore.set).not.toHaveBeenCalled();
  });
});
