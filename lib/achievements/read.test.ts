import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ findUnique: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: { achievementState: { findUnique: m.findUnique } } }));
vi.mock("./config", () => ({ achievementsEnabled: () => true }));
vi.mock("./mail-availability", () => ({ achievementMailAvailable: async () => false }));

import { calendarDay, shiftDay } from "./calendar";
import { readAchievementHeader } from "./read";

const today = calendarDay(new Date(), "UTC");
const state = (presenceLastDay: string | null, practiceLastDay: string | null) => ({
  enabled: true,
  showHeader: true,
  timeZone: "UTC",
  presenceCurrent: 4,
  presenceLastDay,
  practiceCurrent: 0,
  practiceLastDay,
});

describe("header streak", () => {
  beforeEach(() => vi.clearAllMocks());
  it("counts presence days, not practice days", async () => {
    m.findUnique.mockResolvedValue(state(today, null));
    expect(await readAchievementHeader("a")).toMatchObject({ current: 4 });
    expect(m.findUnique.mock.calls[0][0].select).toMatchObject({
      presenceCurrent: true,
      presenceLastDay: true,
    });
  });
  it("keeps yesterday's streak alive and drops an older one", async () => {
    m.findUnique.mockResolvedValue(state(shiftDay(today, -1), null));
    expect(await readAchievementHeader("a")).toMatchObject({ current: 4 });
    m.findUnique.mockResolvedValue(state(shiftDay(today, -2), today));
    expect(await readAchievementHeader("a")).toMatchObject({ current: 0 });
  });
});
