import "server-only";
import { writeAudit } from "@/lib/auth/audit";
import { prisma } from "@/lib/db/prisma";
import { readDemoConfig } from "@/lib/demo/config";
import { calendarDay } from "./calendar";
import { achievementsEnabled } from "./config";
import {
  planJoin,
  planLeave,
  THIRTY_DAYS_DEFINITION_VERSION,
  THIRTY_DAYS_KIND,
  type ThirtyDayEnrollment,
} from "./thirty-days";

const enrollmentWhere = (userId: string) => ({
  userId_kind_definitionVersion: {
    userId,
    kind: THIRTY_DAYS_KIND,
    definitionVersion: THIRTY_DAYS_DEFINITION_VERSION,
  },
});

function enrollmentOf(row: {
  joinedOn: string;
  leftAt: Date | null;
  timeZone: string;
}): ThirtyDayEnrollment {
  return {
    joinedOn: row.joinedOn,
    leftOn: row.leftAt ? calendarDay(row.leftAt, row.timeZone) : null,
  };
}

async function readyEnrollment(userId: string) {
  if (!achievementsEnabled() || readDemoConfig().kind !== "disabled")
    return { kind: "disabled" as const };
  const state = await prisma.achievementState.upsert({
    where: { userId },
    create: { userId },
    update: {},
  });
  if (!state.enabled) return { kind: "tracking_off" as const };
  return { kind: "ready" as const, state };
}

async function auditEnrollment(userId: string, joined: boolean, day: string) {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { publicId: true },
  });
  await writeAudit({
    action: "account.achievements_thirty_days",
    actorId: userId,
    targetId: user.publicId,
    targetType: "user",
    after: { joined, day },
  });
}

export async function joinThirtyDays(userId: string, onCommitted?: () => void) {
  const ready = await readyEnrollment(userId);
  if (ready.kind !== "ready") return ready;
  const today = calendarDay(new Date(), ready.state.timeZone);
  const current = await prisma.achievementEnrollment.findUnique({ where: enrollmentWhere(userId) });
  const plan = planJoin(current ? enrollmentOf(current) : null, today);
  if (plan.kind === "already_joined") return { kind: "already_joined" as const };
  await prisma.achievementEnrollment.upsert({
    where: enrollmentWhere(userId),
    create: {
      userId,
      kind: THIRTY_DAYS_KIND,
      definitionVersion: THIRTY_DAYS_DEFINITION_VERSION,
      joinedOn: plan.enrollment.joinedOn,
      leftAt: null,
      timeZone: ready.state.timeZone,
    },
    update: { leftAt: null },
  });
  onCommitted?.();
  await auditEnrollment(userId, true, plan.enrollment.joinedOn);
  return { kind: "joined" as const, joinedOn: plan.enrollment.joinedOn };
}

export async function leaveThirtyDays(userId: string, onCommitted?: () => void) {
  const ready = await readyEnrollment(userId);
  if (ready.kind !== "ready") return ready;
  const today = calendarDay(new Date(), ready.state.timeZone);
  const current = await prisma.achievementEnrollment.findUnique({ where: enrollmentWhere(userId) });
  const plan = planLeave(current ? enrollmentOf(current) : null, today);
  if (plan.kind !== "left") return { kind: plan.kind };
  await prisma.achievementEnrollment.update({
    where: enrollmentWhere(userId),
    data: { leftAt: new Date() },
  });
  onCommitted?.();
  await auditEnrollment(userId, false, plan.enrollment.leftOn ?? today);
  return { kind: "left" as const, leftOn: plan.enrollment.leftOn ?? today };
}
