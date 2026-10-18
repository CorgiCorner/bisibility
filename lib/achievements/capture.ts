import "server-only";
import { prisma } from "@/lib/db/prisma";
import { readDemoConfig } from "@/lib/demo/config";
import { publishWorkerIntent } from "@/lib/worker-intents/realtime";
import { calendarDay } from "./calendar";
import { achievementsEnabled } from "./config";
import type { BadgeKind } from "./progress";
export async function captureDailyActivity(
  userId: string,
  kind: BadgeKind,
): Promise<"recorded" | "existing" | "disabled" | "unavailable"> {
  if (!achievementsEnabled() || readDemoConfig().kind !== "disabled") return "disabled";
  try {
    const state = await prisma.achievementState.upsert({
      where: { userId },
      create: { userId },
      update: {},
    });
    if (!state.enabled) return "disabled";
    const now = new Date();
    const created = await prisma.achievementDay.createMany({
      data: [
        {
          userId,
          kind,
          epoch: state.epoch,
          localDay: calendarDay(now, state.timeZone),
          timeZone: state.timeZone,
          acceptedAt: now,
        },
      ],
      skipDuplicates: true,
    });
    if (created.count) await publishWorkerIntent("achievements");
    return created.count > 0 ? "recorded" : "existing";
  } catch {
    console.error("[achievements] activity capture deferred");
    return "unavailable";
  }
}

export async function recordActivity(userId: string, kind: BadgeKind) {
  return (await captureDailyActivity(userId, kind)) === "recorded";
}
