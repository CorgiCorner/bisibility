import { beforeEach, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ session: vi.fn(), require: vi.fn(), capture: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({
  getOptionalAvailableSession: m.session,
  requireSession: m.require,
}));
vi.mock("@/lib/achievements/capture", () => ({ captureDailyActivity: m.capture }));
vi.mock("@/lib/achievements/preferences", () => ({ updateAchievementPreferences: vi.fn() }));
vi.mock("@/lib/achievements/read", () => ({ readAchievements: vi.fn() }));
vi.mock("@/lib/achievements/sharing", () => ({ setAchievementSharing: vi.fn() }));

import { touchAchievementVisit } from "@/lib/actions/achievements";

beforeEach(() => vi.resetAllMocks());
it("never redirects an expired background visit to login", async () => {
  m.session.mockResolvedValue(null);
  expect(await touchAchievementVisit()).toEqual({ recorded: false, retry: false });
  expect(m.require).not.toHaveBeenCalled();
  expect(m.capture).not.toHaveBeenCalled();
});
it("distinguishes unavailable authorization from an expired session", async () => {
  m.session.mockRejectedValue(new Error("pool unavailable"));
  expect(await touchAchievementVisit()).toEqual({ recorded: false, retry: true });
});
