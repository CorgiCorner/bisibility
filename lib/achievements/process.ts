import "server-only";
import { prisma } from "@/lib/db/prisma";
import { calendarDay, nextMorning } from "./calendar";
import { achievementEmailsEnabled, achievementsEnabled } from "./config";
import { badgeKinds, progressForDays } from "./progress";
export async function processAchievementUser(userId: string, now = new Date()) {
  if (!achievementsEnabled()) return;
  await prisma.$transaction(
    async (tx) => {
      const state = await tx.achievementState.update({
        where: { userId },
        data: { updatedAt: now },
        include: { user: { select: { deactivatedAt: true, marketingEmailUnsubscribedAt: true } } },
      });
      const pending = await tx.achievementDay.findMany({
        where: { userId, processedAt: null },
        select: { id: true },
      });
      if (!state.enabled || state.user.deactivatedAt) {
        await tx.achievementDay.updateMany({
          where: { id: { in: pending.map((p) => p.id) } },
          data: { processedAt: now },
        });
        return;
      }
      const facts = await tx.achievementDay.findMany({
        where: { userId, epoch: state.epoch },
        select: { kind: true, localDay: true },
        orderBy: { localDay: "asc" },
      });
      const today = calendarDay(now, state.timeZone);
      const progress = Object.fromEntries(
        badgeKinds.map((kind) => [
          kind,
          progressForDays(
            facts.filter((f) => f.kind === kind).map((f) => f.localDay),
            today,
          ),
        ]),
      );
      await tx.achievementState.update({
        where: { userId },
        data: {
          presenceCurrent: progress.presence.current,
          presenceLongest: Math.max(state.presenceLongest, progress.presence.longest),
          presenceLastDay: progress.presence.lastDay,
          practiceCurrent: progress.practice.current,
          practiceLongest: Math.max(state.practiceLongest, progress.practice.longest),
          practiceLastDay: progress.practice.lastDay,
        },
      });
      for (const kind of badgeKinds) {
        const earnedDay = progress[kind].earnedDay;
        if (!earnedDay) continue;
        const created = await tx.achievementAward.createMany({
          data: [
            {
              userId,
              kind,
              earnedDay,
              epoch: state.epoch,
              timeZone: state.timeZone,
              earnedAt: now,
            },
          ],
          skipDuplicates: true,
        });
        if (
          created.count &&
          achievementEmailsEnabled() &&
          state.emailEnabled &&
          !state.user.marketingEmailUnsubscribedAt
        )
          await tx.achievementMail.upsert({
            where: { userId_epoch_awardDay: { userId, epoch: state.epoch, awardDay: earnedDay } },
            create: {
              userId,
              epoch: state.epoch,
              awardDay: earnedDay,
              timeZone: state.timeZone,
              dueAt: nextMorning(earnedDay, state.timeZone),
            },
            update: {},
          });
      }
      await tx.achievementDay.updateMany({
        where: { id: { in: pending.map((p) => p.id) } },
        data: { processedAt: now },
      });
    },
    { maxWait: 1500, timeout: 5000 },
  );
}
export async function hasAchievementIntent() {
  if (!achievementsEnabled()) return false;
  return (
    Boolean(
      await prisma.achievementDay.findFirst({ where: { processedAt: null }, select: { id: true } }),
    ) ||
    (achievementEmailsEnabled() &&
      Boolean(
        await prisma.achievementMail.findFirst({
          where: {
            OR: [
              { status: "queued", dueAt: { lte: new Date() } },
              { status: "sending", claimedAt: { lt: new Date(Date.now() - 600000) } },
            ],
          },
          select: { id: true },
        }),
      ))
  );
}
export async function sweepAchievementFacts(limit = 25) {
  if (!achievementsEnabled()) return { processed: 0 };
  const pending = await prisma.achievementDay.findMany({
    where: { processedAt: null },
    distinct: ["userId"],
    select: { userId: true },
    orderBy: { userId: "asc" },
    take: limit,
  });
  let processed = 0;
  for (const entry of pending) {
    try {
      await processAchievementUser(entry.userId);
      processed++;
    } catch {
      console.error("[achievements] daily fact processing failed");
    }
  }
  return { processed };
}
