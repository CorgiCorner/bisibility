import "server-only";
import { writeAudit } from "@/lib/auth/audit";
import { prisma } from "@/lib/db/prisma";
import { readDemoConfig } from "@/lib/demo/config";
import { achievementsEnabled } from "./config";
import { preferenceSchema } from "./schema";
export async function updateAchievementPreferences(userId: string, input: unknown) {
  const data = preferenceSchema.parse(input);
  if (!achievementsEnabled() || readDemoConfig().kind !== "disabled")
    return { kind: "disabled" as const };
  const state = await prisma.achievementState.upsert({
    where: { userId },
    create: { userId },
    update: {},
  });
  const changed = state.timeZone !== data.timeZone;
  if (changed && !data.restartCalendar) return { kind: "restart_required" as const };
  const result = await prisma.achievementState.updateMany({
    where: { userId, revision: data.revision },
    data: {
      enabled: data.enabled,
      showHeader: data.showHeader,
      emailEnabled: data.emailEnabled,
      timeZone: data.timeZone,
      revision: { increment: 1 },
      ...(changed
        ? {
            epoch: { increment: 1 },
            presenceCurrent: 0,
            presenceLastDay: null,
            practiceCurrent: 0,
            practiceLastDay: null,
          }
        : {}),
    },
  });
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { publicId: true },
  });
  if (result.count)
    await writeAudit({
      action: "account.achievements_preferences",
      actorId: userId,
      targetId: user.publicId,
      targetType: "user",
      after: {
        enabled: data.enabled,
        showHeader: data.showHeader,
        emailEnabled: data.emailEnabled,
        timeZone: data.timeZone,
        epoch: state.epoch + (changed ? 1 : 0),
        revision: data.revision + 1,
      },
    });
  return { kind: result.count === 1 ? ("saved" as const) : ("conflict" as const) };
}
