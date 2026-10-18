import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  transaction: vi.fn(),
  stateUpdate: vi.fn(),
  daysRead: vi.fn(),
  daysUpdate: vi.fn(),
  award: vi.fn(),
  mail: vi.fn(),
  pending: vi.fn(),
  emailEnabled: true,
}));
vi.mock("./config", () => ({
  achievementsEnabled: () => true,
  achievementEmailsEnabled: () => m.emailEnabled,
}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: { $transaction: m.transaction, achievementDay: { findMany: m.pending } },
}));

import { shiftDay } from "./calendar";
import { processAchievementUser, sweepAchievementFacts } from "./process";

describe("durable daily achievement processing", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    m.emailEnabled = true;
    m.stateUpdate.mockResolvedValue({
      enabled: true,
      emailEnabled: true,
      epoch: 1,
      timeZone: "UTC",
      presenceLongest: 0,
      practiceLongest: 0,
      user: { deactivatedAt: null },
    });
    m.daysRead
      .mockResolvedValueOnce([{ id: "presence-day" }, { id: "practice-day" }])
      .mockResolvedValueOnce([
        ...Array.from({ length: 7 }, (_, i) => ({
          kind: "presence",
          localDay: shiftDay("2026-10-10", i),
        })),
        ...Array.from({ length: 7 }, (_, i) => ({
          kind: "practice",
          localDay: shiftDay("2026-10-10", i),
        })),
      ]);
    m.award.mockResolvedValue({ count: 1 });
    m.transaction.mockImplementation(async (run) =>
      run({
        achievementState: { update: m.stateUpdate },
        achievementDay: { findMany: m.daysRead, updateMany: m.daysUpdate },
        achievementAward: { createMany: m.award },
        achievementMail: { upsert: m.mail },
      }),
    );
  });
  it("keeps the two streaks separate, awards once and combines the delivery identity", async () => {
    await processAchievementUser("a", new Date("2026-10-16T20:00:00Z"));
    expect(m.stateUpdate.mock.calls[1][0].data).toMatchObject({
      presenceCurrent: 7,
      practiceCurrent: 7,
      presenceLongest: 7,
      practiceLongest: 7,
    });
    expect(m.award).toHaveBeenCalledTimes(2);
    for (const call of m.award.mock.calls)
      expect(call[0]).toMatchObject({
        skipDuplicates: true,
        data: [expect.objectContaining({ userId: "a", epoch: 1, earnedDay: "2026-10-16" })],
      });
    expect(m.mail.mock.calls[0][0].where).toEqual(m.mail.mock.calls[1][0].where);
    expect(m.daysUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: { in: ["presence-day", "practice-day"] } } }),
    );
  });
  it("reprocessing cannot queue another email for an already-earned badge", async () => {
    m.award.mockResolvedValue({ count: 0 });
    await processAchievementUser("a", new Date("2026-10-16T20:00:00Z"));
    expect(m.mail).not.toHaveBeenCalled();
  });
  it("disabled users do not gain awards, and only captured pending IDs are acknowledged", async () => {
    m.stateUpdate.mockResolvedValue({ enabled: false, user: { deactivatedAt: null } });
    await processAchievementUser("a");
    expect(m.award).not.toHaveBeenCalled();
    expect(m.daysRead).toHaveBeenCalledTimes(1);
    expect(m.daysUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: { in: ["presence-day", "practice-day"] } } }),
    );
  });
  it("does not backfill mail when the instance did not enable mail at award time", async () => {
    m.emailEnabled = false;
    await processAchievementUser("a", new Date("2026-10-16T20:00:00Z"));
    expect(m.award).toHaveBeenCalled();
    expect(m.mail).not.toHaveBeenCalled();
  });
  it("continues after a failing user rather than starving later facts", async () => {
    m.pending.mockResolvedValue([{ userId: "a" }, { userId: "b" }]);
    m.transaction
      .mockReset()
      .mockRejectedValueOnce(new Error("expired transaction"))
      .mockResolvedValueOnce(undefined);
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(await sweepAchievementFacts()).toEqual({ processed: 1 });
      expect(m.transaction).toHaveBeenCalledTimes(2);
    } finally {
      log.mockRestore();
    }
  });
});
