import { beforeEach, describe, expect, it, vi } from "vitest";
import { updateOnboardingProject } from "./update-project";

const mocks = vi.hoisted(() => ({
  actor: vi.fn(),
  scope: vi.fn(),
  update: vi.fn(),
  pending: vi.fn(),
  cancel: vi.fn(),
  revalidate: vi.fn(),
}));
vi.mock("@/lib/actions/_shared", () => ({
  getActionActor: mocks.actor,
  requireProjectScope: mocks.scope,
  parseActionInput: (schema: { parse: (input: unknown) => unknown }, input: unknown) =>
    schema.parse(input),
  revalidateProviderViews: mocks.revalidate,
  revalidateSettingsViews: mocks.revalidate,
}));
vi.mock("@/lib/onboarding/update-project", () => ({ updateUnmeasuredProject: mocks.update }));
vi.mock("@/lib/providers/analytics/google-oauth-pending", () => ({
  getPendingGoogleOAuthProvider: mocks.pending,
  cancelPendingGoogleOAuth: mocks.cancel,
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
const project = { id: "internal", publicId: "prj_1", domain: "tes.co", name: "tes" };
beforeEach(() => {
  vi.resetAllMocks();
  mocks.actor.mockResolvedValue({ id: "actor" });
  mocks.scope.mockResolvedValue(project);
  mocks.update.mockResolvedValue({ ok: true, changed: true, project });
});
describe("updateOnboardingProject action", () => {
  it("authorizes the project, derives its identity, and clears only pending GSC", async () => {
    mocks.pending.mockResolvedValue("gsc");
    await updateOnboardingProject({ projectId: "prj_1", website: "https://www.tes.co/path" });
    expect(mocks.scope).toHaveBeenCalledWith({ id: "actor" }, "update", "prj_1", {
      type: "project",
    });
    expect(mocks.update).toHaveBeenCalledWith({
      actorId: "actor",
      projectId: "internal",
      identity: { domain: "tes.co", name: "tes" },
    });
    expect(mocks.cancel).toHaveBeenCalledWith("prj_1");
  });
  it("does not reach the transaction without authorization", async () => {
    mocks.scope.mockRejectedValue(new Error("Forbidden"));
    await expect(
      updateOnboardingProject({ projectId: "prj_1", website: "tes.co" }),
    ).rejects.toThrow("Forbidden");
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it("preserves pending GA4 selection", async () => {
    mocks.pending.mockResolvedValue("ga4");
    await updateOnboardingProject({ projectId: "prj_1", website: "tes.co" });
    expect(mocks.cancel).not.toHaveBeenCalled();
  });
  it.each([
    { ok: true, changed: false, project },
    { ok: false, error: { code: "PROJECT_HAS_RANK_CHECKS" }, project },
  ])("keeps no-op and typed refusal free of follow-up mutations", async (result) => {
    mocks.update.mockResolvedValue(result);
    expect(await updateOnboardingProject({ projectId: "prj_1", website: "tes.co" })).toEqual(
      result,
    );
    expect(mocks.pending).not.toHaveBeenCalled();
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });
});
