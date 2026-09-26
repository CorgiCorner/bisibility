import { beforeEach, describe, expect, it, vi } from "vitest";
import { setDefaultProject } from "./default-project";

const projectId = "prj_abcdefghijklmnopqrstuvwx";
const userPublicId = "usr_abcdefghijklmnopqrstuvwx";

const mocks = vi.hoisted(() => ({
  findDefaultProjectCandidate: vi.fn(),
  getActionActor: vi.fn(),
  persistDefaultProject: vi.fn(),
  requireMutableAccountSession: vi.fn(),
  writeAudit: vi.fn(),
  writeAuditFailure: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/actions/_shared", () => ({ getActionActor: mocks.getActionActor }));
vi.mock("@/lib/auth/audit", () => ({
  writeAudit: mocks.writeAudit,
  writeAuditFailure: mocks.writeAuditFailure,
}));
vi.mock("@/lib/demo/mutable-account-session", () => ({
  requireMutableAccountSession: mocks.requireMutableAccountSession,
}));
vi.mock("@/lib/queries/default-project", () => ({
  findDefaultProjectCandidate: mocks.findDefaultProjectCandidate,
  persistDefaultProject: mocks.persistDefaultProject,
}));

describe("setDefaultProject", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireMutableAccountSession.mockResolvedValue({ user: { id: "user_1" } });
    mocks.getActionActor.mockResolvedValue({
      id: "user_1",
      memberships: [{ projectId: "project_1", role: "viewer" }],
      role: "member",
    });
    mocks.findDefaultProjectCandidate.mockResolvedValue({
      id: "project_1",
      onboardingCompletedAt: new Date("2026-09-01T06:00:00.000Z"),
      publicId: projectId,
    });
    mocks.writeAuditFailure.mockResolvedValue(undefined);
    mocks.persistDefaultProject.mockResolvedValue({
      changed: true,
      previousProjectId: null,
      publicId: userPublicId,
    });
  });

  it("stores a member project as the default and audits the change", async () => {
    await expect(setDefaultProject({ projectId })).resolves.toEqual({
      ok: true,
      value: { projectId },
    });

    expect(mocks.findDefaultProjectCandidate).toHaveBeenCalledWith(projectId);
    expect(mocks.persistDefaultProject).toHaveBeenCalledWith("user_1", {
      id: "project_1",
      publicId: projectId,
    });
    expect(mocks.writeAudit).toHaveBeenCalledWith({
      action: "user.default_project.update",
      actorId: "user_1",
      after: { defaultProjectId: projectId },
      before: { defaultProjectId: null },
      targetId: userPublicId,
      targetType: "user",
    });
  });

  it("rejects a project the actor has no membership in, exactly like a missing one", async () => {
    mocks.findDefaultProjectCandidate.mockResolvedValue({
      id: "project_other",
      onboardingCompletedAt: new Date("2026-09-01T06:00:00.000Z"),
      publicId: "prj_bbcdefghijklmnopqrstuvwx",
    });

    const result = await setDefaultProject({ projectId: "prj_bbcdefghijklmnopqrstuvwx" });

    expect(result).toEqual({
      error: { code: "not_found", message: "Project not found.", status: 404 },
      ok: false,
    });
    expect(mocks.persistDefaultProject).not.toHaveBeenCalled();
    expect(mocks.writeAudit).not.toHaveBeenCalled();
  });

  it("returns not found for an unknown project", async () => {
    mocks.findDefaultProjectCandidate.mockResolvedValue(null);

    await expect(setDefaultProject({ projectId })).resolves.toMatchObject({
      error: { code: "not_found" },
      ok: false,
    });
    expect(mocks.persistDefaultProject).not.toHaveBeenCalled();
  });

  it("refuses a project that has not finished onboarding, since the entry page skips it", async () => {
    mocks.findDefaultProjectCandidate.mockResolvedValue({
      id: "project_1",
      onboardingCompletedAt: null,
      publicId: projectId,
    });

    await expect(setDefaultProject({ projectId })).resolves.toMatchObject({
      error: { code: "invalid_input" },
      ok: false,
    });
    expect(mocks.persistDefaultProject).not.toHaveBeenCalled();
  });

  it("clears the default without a project lookup and audits the previous value", async () => {
    mocks.persistDefaultProject.mockResolvedValue({
      changed: true,
      previousProjectId: projectId,
      publicId: userPublicId,
    });

    await expect(setDefaultProject({ projectId: null })).resolves.toEqual({
      ok: true,
      value: { projectId: null },
    });

    expect(mocks.findDefaultProjectCandidate).not.toHaveBeenCalled();
    expect(mocks.persistDefaultProject).toHaveBeenCalledWith("user_1", null);
    expect(mocks.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        after: { defaultProjectId: null },
        before: { defaultProjectId: projectId },
      }),
    );
  });

  it("skips the audit when the default is already that project", async () => {
    mocks.persistDefaultProject.mockResolvedValue({
      changed: false,
      previousProjectId: projectId,
      publicId: userPublicId,
    });

    await expect(setDefaultProject({ projectId })).resolves.toMatchObject({ ok: true });
    expect(mocks.writeAudit).not.toHaveBeenCalled();
  });

  it.each([
    [{ projectId: "kw_abcdefghijklmnopqrstuvwx" }],
    [{ projectId: 42 }],
    [{}],
    [{ projectId, userId: "user_2" }],
  ])("rejects malformed input %j before touching storage", async (input) => {
    await expect(setDefaultProject(input)).resolves.toMatchObject({
      error: { code: "invalid_input" },
      ok: false,
    });
    expect(mocks.findDefaultProjectCandidate).not.toHaveBeenCalled();
    expect(mocks.persistDefaultProject).not.toHaveBeenCalled();
  });

  it("keeps locked demo accounts read-only", async () => {
    mocks.requireMutableAccountSession.mockRejectedValue(
      new Error("Account settings are locked in this demo."),
    );

    await expect(setDefaultProject({ projectId })).rejects.toThrow("locked in this demo");
    expect(mocks.persistDefaultProject).not.toHaveBeenCalled();
  });
});
