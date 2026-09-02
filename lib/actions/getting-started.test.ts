import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cookieStore: { get: vi.fn(), set: vi.fn(), delete: vi.fn() },
  getActionActor: vi.fn(),
  loadSetupContext: vi.fn(),
  markSetupAcknowledged: vi.fn(),
  requireProjectScope: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: async () => mocks.cookieStore }));
vi.mock("@/lib/actions/_shared", () => ({
  getActionActor: mocks.getActionActor,
  requireProjectScope: mocks.requireProjectScope,
}));
vi.mock("@/lib/queries/setup-context", () => ({ loadSetupContext: mocks.loadSetupContext }));
vi.mock("@/lib/getting-started/setup-acknowledgement", () => ({
  SETUP_ACKNOWLEDGEMENT_COOKIE: "getting-started-ack",
  markSetupAcknowledged: mocks.markSetupAcknowledged,
}));

import { acknowledgeGettingStarted } from "./getting-started";

const projectRef = "prj_abcdefghijklmnopqrstuvwx";

describe("acknowledgeGettingStarted", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getActionActor.mockResolvedValue({ id: "user-1", memberships: [], role: "member" });
    mocks.requireProjectScope.mockResolvedValue({ id: "project-1", publicId: projectRef });
    mocks.loadSetupContext.mockResolvedValue({
      completedCheckCount: 1,
      inFlightBatch: null,
      keywordCount: 1,
      keywordIds: ["kw_abcdefghijklmnopqrstuvwx"],
      project: { exists: true, name: "Example", publicRef: projectRef },
      providerExists: true,
      schedule: { mode: "manual" },
    });
    mocks.markSetupAcknowledged.mockResolvedValue(undefined);
  });

  it("validates access, persists acknowledgement, and clears the legacy cookie", async () => {
    await expect(acknowledgeGettingStarted({ projectRef })).resolves.toEqual({ ok: true });
    expect(mocks.requireProjectScope).toHaveBeenCalledWith(
      expect.objectContaining({ id: "user-1" }),
      "read",
      projectRef,
      { type: "project" },
      { allowReadOnly: true },
    );
    expect(mocks.markSetupAcknowledged).toHaveBeenCalledWith("user-1", projectRef);
    expect(mocks.cookieStore.delete).toHaveBeenCalledWith("getting-started-ack");
    expect(mocks.cookieStore.set).not.toHaveBeenCalled();
  });

  it("rejects acknowledgement before setup is complete without writing", async () => {
    mocks.loadSetupContext.mockResolvedValueOnce({
      completedCheckCount: 0,
      inFlightBatch: null,
      keywordCount: 1,
      keywordIds: ["kw_abcdefghijklmnopqrstuvwx"],
      project: { exists: true, name: "Example", publicRef: projectRef },
      providerExists: true,
      schedule: { mode: "manual" },
    });
    await expect(acknowledgeGettingStarted({ projectRef })).resolves.toEqual({
      ok: false,
      reason: "incomplete",
    });
    expect(mocks.markSetupAcknowledged).not.toHaveBeenCalled();
    expect(mocks.cookieStore.delete).not.toHaveBeenCalled();
  });

  it("surfaces write failures without claiming the checklist changed", async () => {
    mocks.markSetupAcknowledged.mockRejectedValueOnce(new Error("database unavailable"));
    await expect(acknowledgeGettingStarted({ projectRef })).resolves.toEqual({
      ok: false,
      reason: "write_failed",
    });
    expect(mocks.cookieStore.delete).not.toHaveBeenCalled();
  });

  it("rejects invalid and inaccessible project references before writing", async () => {
    await expect(acknowledgeGettingStarted({ projectRef: "project-1" })).rejects.toThrow();
    expect(mocks.requireProjectScope).not.toHaveBeenCalled();
    expect(mocks.markSetupAcknowledged).not.toHaveBeenCalled();

    mocks.requireProjectScope.mockRejectedValueOnce(new Error("Project not found."));
    await expect(acknowledgeGettingStarted({ projectRef })).rejects.toThrow("Project not found.");
    expect(mocks.markSetupAcknowledged).not.toHaveBeenCalled();
  });
});
