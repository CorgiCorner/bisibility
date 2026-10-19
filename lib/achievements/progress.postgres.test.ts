import { randomUUID } from "node:crypto";
import { businessLocationDatabase } from "@/lib/business-location-store/postgres.test-fixture";
import { makePublicId } from "@/lib/db/public-id-resources";
import type { PrismaClient } from "@/lib/generated/prisma/client";
import { afterAll, beforeAll, expect, it, vi } from "vitest";

const holder = vi.hoisted(() => ({ client: null as PrismaClient | null }));
vi.mock("@/lib/db/prisma", () => ({
  prisma: new Proxy(
    {},
    {
      get(_target, key) {
        if (!holder.client) throw new Error("Owned achievements fixture is not initialized.");
        const value = Reflect.get(holder.client, key);
        return typeof value === "function" ? value.bind(holder.client) : value;
      },
    },
  ),
}));
vi.mock("@/lib/worker-intents/realtime", () => ({ publishWorkerIntent: vi.fn() }));
vi.mock("@/lib/auth/audit", () => ({ writeAudit: vi.fn() }));
vi.mock("./config", () => ({
  achievementsEnabled: () => true,
  achievementEmailsEnabled: () => true,
}));

import { captureDailyActivity } from "./capture";
import { updateAchievementPreferences } from "./preferences";
import { processAchievementUser } from "./process";
import { readAchievements } from "./read";

let fixture: Awaited<ReturnType<typeof businessLocationDatabase>>;
let userId: string;
beforeAll(async () => {
  fixture = await businessLocationDatabase();
  holder.client = fixture.db;
  const user = await fixture.db.user.create({
    data: {
      publicId: makePublicId("usr"),
      name: "Activity fixture",
      email: `${randomUUID()}@example.com`,
      emailVerified: true,
    },
  });
  userId = user.id;
}, 60_000);
afterAll(async () => {
  vi.useRealTimers();
  await fixture?.close();
});

it("concurrent visits and workers award once, and a calendar restart preserves permanent badges", async () => {
  const now = new Date("2026-10-16T18:00:00Z");
  vi.setSystemTime(now);
  await fixture.db.achievementState.create({ data: { userId, timeZone: "UTC" } });
  await fixture.db.achievementDay.createMany({
    data: ["presence", "practice"].flatMap((kind) =>
      Array.from({ length: 6 }, (_, index) => ({
        userId,
        epoch: 1,
        kind,
        localDay: `2026-10-${10 + index}`,
        timeZone: "UTC",
      })),
    ),
  });
  const captures = await Promise.all(
    ["presence", "presence", "practice", "practice"].map((kind) =>
      captureDailyActivity(userId, kind as "presence" | "practice"),
    ),
  );
  expect(captures.filter((result) => result === "recorded")).toHaveLength(2);
  expect(captures.filter((result) => result === "existing")).toHaveLength(2);
  await Promise.all([processAchievementUser(userId, now), processAchievementUser(userId, now)]);
  const view = await readAchievements(userId);
  expect(view?.presence).toMatchObject({ current: 7, longest: 7 });
  expect(view?.practice).toMatchObject({ current: 7, longest: 7 });
  expect(view?.awards.map((award) => award.kind).sort()).toEqual(["practice", "presence"]);
  expect(await fixture.db.achievementDay.count({ where: { userId } })).toBe(14);
  expect(await fixture.db.achievementMail.count({ where: { userId } })).toBe(1);
  expect(await fixture.db.achievementDay.count({ where: { userId, processedAt: null } })).toBe(0);

  expect(
    await updateAchievementPreferences(userId, {
      enabled: true,
      emailEnabled: true,
      showHeader: true,
      revision: 0,
      timeZone: "Europe/Warsaw",
      restartCalendar: true,
    }),
  ).toEqual({ kind: "saved" });
  await processAchievementUser(userId, now);
  const restarted = await readAchievements(userId);
  expect(restarted).toMatchObject({ epoch: 2, revision: 1 });
  expect(restarted?.presence).toMatchObject({ current: 0, longest: 7, days: [] });
  expect(restarted?.practice).toMatchObject({ current: 0, longest: 7, days: [] });
  expect(restarted?.awards).toHaveLength(2);
  expect(await fixture.db.achievementMail.count({ where: { userId } })).toBe(1);

  await fixture.db.user.delete({ where: { id: userId } });
  expect(
    await Promise.all([
      fixture.db.achievementState.count({ where: { userId } }),
      fixture.db.achievementDay.count({ where: { userId } }),
      fixture.db.achievementAward.count({ where: { userId } }),
      fixture.db.achievementMail.count({ where: { userId } }),
    ]),
  ).toEqual([0, 0, 0, 0]);
}, 30_000);
