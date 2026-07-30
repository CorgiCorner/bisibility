import { beforeEach, describe, expect, it, vi } from "vitest";
import { deleteWorkspace, submitBillingInterest } from "./actions";

const mocks = vi.hoisted(() => ({
  deleteProjectById: vi.fn(),
  getActionActor: vi.fn(),
  joinWaitlist: vi.fn(),
  readActorProjects: vi.fn(),
  readProjectDeleteSnapshot: vi.fn(),
  requireProjectScope: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/actions/_shared", () => ({
  getActionActor: mocks.getActionActor,
  parseActionInput: (schema: { parse: (input: unknown) => unknown }, input: unknown) =>
    schema.parse(input),
  requireProjectScope: mocks.requireProjectScope,
  revalidateSettingsViews: vi.fn(),
}));
vi.mock("@/lib/actions/project", () => ({
  deleteProjectById: mocks.deleteProjectById,
  readActorProjects: mocks.readActorProjects,
  readProjectDeleteSnapshot: mocks.readProjectDeleteSnapshot,
  readProjectSettingsSnapshot: vi.fn(),
  updateProjectSettingsSnapshot: vi.fn(),
}));
vi.mock("@/lib/actions/waitlist", () => ({ joinWaitlist: mocks.joinWaitlist }));
vi.mock("@/lib/auth/audit", () => ({
  requiredPublicAuditId: (value: string) => value,
  writeAudit: vi.fn(),
}));

describe("settings actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getActionActor.mockResolvedValue({ id: "user_1" });
    mocks.readActorProjects.mockResolvedValue([]);
    mocks.readProjectDeleteSnapshot.mockResolvedValue({
      domain: "example.com",
      publicId: "prj_a00000000000000000000000",
    });
    mocks.requireProjectScope.mockResolvedValue({
      id: "project_internal_1",
      publicId: "prj_a00000000000000000000000",
    });
    mocks.joinWaitlist.mockResolvedValue({ email: "owner@example.com", ok: true });
  });

  it("returns the first remaining workspace after deletion", async () => {
    mocks.readActorProjects.mockResolvedValue([
      { id: "project_internal_2", publicId: "prj_b00000000000000000000000" },
    ]);

    await expect(
      deleteWorkspace({
        confirmText: "example.com",
        projectId: "prj_a00000000000000000000000",
      }),
    ).resolves.toEqual({
      hasRemainingWorkspace: true,
      id: "prj_a00000000000000000000000",
      nextProjectPublicId: "prj_b00000000000000000000000",
    });

    expect(mocks.readActorProjects).toHaveBeenCalledWith("user_1");
    expect(mocks.readActorProjects.mock.invocationCallOrder[0]).toBeGreaterThan(
      mocks.deleteProjectById.mock.invocationCallOrder[0],
    );
  });

  it("returns onboarding state when no workspace remains", async () => {
    await expect(
      deleteWorkspace({
        confirmText: "example.com",
        projectId: "prj_a00000000000000000000000",
      }),
    ).resolves.toEqual({
      hasRemainingWorkspace: false,
      id: "prj_a00000000000000000000000",
      nextProjectPublicId: null,
    });
  });

  it("authorizes billing interest against the owner-only billing resource", async () => {
    const input = {
      email: "owner@example.com",
      projectId: "prj_a00000000000000000000000",
      source: "settings_notify",
    };

    await submitBillingInterest(input);

    expect(mocks.requireProjectScope).toHaveBeenCalledWith(
      { id: "user_1" },
      "manage",
      "prj_a00000000000000000000000",
      {
        type: "billing",
      },
    );
    expect(mocks.joinWaitlist).toHaveBeenCalledWith(input);
    expect(mocks.joinWaitlist.mock.invocationCallOrder[0]).toBeGreaterThan(
      mocks.requireProjectScope.mock.invocationCallOrder[0],
    );
  });

  it("does not submit when billing authorization fails", async () => {
    mocks.requireProjectScope.mockRejectedValueOnce(new Error("Forbidden"));

    await expect(
      submitBillingInterest({
        email: "member@example.com",
        projectId: "prj_a00000000000000000000000",
        source: "settings_notify",
      }),
    ).rejects.toThrow("Forbidden");

    expect(mocks.joinWaitlist).not.toHaveBeenCalled();
  });
});
