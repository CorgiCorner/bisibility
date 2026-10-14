import { beforeEach, describe, expect, it, vi } from "vitest";

const f = vi.hoisted(() => ({ save: vi.fn(), next: vi.fn(), refresh: vi.fn() }));
vi.mock("@/lib/actions/_shared", () => ({
  getActionActor: async () => ({ id: "writer" }),
  revalidateSettingsViews: f.refresh,
}));
vi.mock("@/lib/measurement-settings/host/defaults", () => ({
  saveDefaultsHost: f.save,
  previewDefaultsHost: vi.fn(),
}));
vi.mock("@/lib/queries/onboarding", () => ({ getOnboardingNextCheckAt: f.next }));

import { AuthorizationError } from "@/lib/auth/authorize";
import { SettingsHostError } from "@/lib/measurement-settings/host/errors";
import { saveReviewedDefaultSettings } from "./defaults-reviewed";

beforeEach(() => vi.resetAllMocks());
describe("defaults action distinguishes refusal from a post-commit read failure", () => {
  it("does not claim an old command was never saved when current access is revoked", async () => {
    f.save.mockRejectedValue(new AuthorizationError("forbidden"));
    expect(await saveReviewedDefaultSettings({}, {})).toMatchObject({
      kind: "unconfirmed",
      code: "forbidden",
    });
    expect(f.refresh).not.toHaveBeenCalled();
  });
  it("returns a known source conflict before save without reporting success", async () => {
    f.save.mockRejectedValue(new SettingsHostError("settings_conflict"));
    expect(await saveReviewedDefaultSettings({}, {})).toMatchObject({
      kind: "not_saved",
      code: "settings_conflict",
    });
    expect(f.refresh).not.toHaveBeenCalled();
    expect(f.next).not.toHaveBeenCalled();
  });
  it("retains ambiguous recovery after committed save and never calls it not_saved", async () => {
    const failure = new Error("synthetic post-commit read unavailable"),
      review = { idempotencyKey: "original-command" };
    f.save.mockResolvedValue({ value: { projectId: `prj_${"a".repeat(24)}` } });
    f.next.mockRejectedValueOnce(failure).mockResolvedValue(null);
    await expect(saveReviewedDefaultSettings({}, review)).rejects.toBe(failure);
    expect(await saveReviewedDefaultSettings({}, review)).toMatchObject({ kind: "saved" });
    expect(f.save.mock.calls[0][2]).toBe(review);
    expect(f.save.mock.calls[1][2]).toBe(review);
  });
});
