import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ upsert: vi.fn(), update: vi.fn(), audit: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    achievementState: { upsert: m.upsert, updateMany: m.update },
    user: { findUniqueOrThrow: vi.fn().mockResolvedValue({ publicId: "usr_a" }) },
  },
}));
vi.mock("@/lib/auth/audit", () => ({ writeAudit: m.audit }));
vi.mock("./config", () => ({ achievementsEnabled: () => true }));
vi.mock("@/lib/demo/config", () => ({ readDemoConfig: () => ({ kind: "disabled" }) }));

import { updateAchievementPreferences } from "./preferences";

const input = {
  enabled: true,
  showHeader: true,
  emailEnabled: false,
  timeZone: "Europe/Warsaw",
  restartCalendar: false,
  revision: 3,
};
describe("personal achievement preferences", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.upsert.mockResolvedValue({ timeZone: "UTC", epoch: 1 });
    m.update.mockResolvedValue({ count: 1 });
  });
  it("requires explicit calendar restart, preserves permanent awards, and scopes revision to session owner", async () => {
    expect(await updateAchievementPreferences("a", input)).toEqual({ kind: "restart_required" });
    expect(m.update).not.toHaveBeenCalled();
    expect(await updateAchievementPreferences("a", { ...input, restartCalendar: true })).toEqual({
      kind: "saved",
    });
    expect(m.update.mock.calls[0][0]).toMatchObject({
      where: { userId: "a", revision: 3 },
      data: { epoch: { increment: 1 }, presenceCurrent: 0, practiceCurrent: 0 },
    });
    expect(m.update.mock.calls[0][0].data).not.toHaveProperty("presenceLongest");
    expect(m.audit).toHaveBeenCalledTimes(1);
  });
  it("returns conflict without claiming a successful change and rejects invalid zones", async () => {
    m.update.mockResolvedValue({ count: 0 });
    expect(await updateAchievementPreferences("a", { ...input, timeZone: "UTC" })).toEqual({
      kind: "conflict",
    });
    expect(m.audit).not.toHaveBeenCalled();
    await expect(
      updateAchievementPreferences("a", { ...input, timeZone: "not/a-zone" }),
    ).rejects.toThrow();
  });
});
