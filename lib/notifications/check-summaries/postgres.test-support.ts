import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import { makePublicId } from "@/lib/db/public-id";
import { recoveryFixture } from "@/lib/provider-evidence/recovery/postgres.test-support";
import { date, window } from "./fixtures.test-support";

export const fixtureNow = date("07:05:00");
export async function summaryFixture(mode: "all" | "important" | "none" = "important") {
  const f = await recoveryFixture({ completed: true });
  const check = await prisma.rankCheck.update({
    where: { id: f.check.id },
    data: {
      checkedAt: date("06:30:00"),
      finishedAt: date("06:31:00"),
      terminalPersistedAt: date("06:31:00"),
      requestedDepth: 100,
      normalizationVersion: "v1",
      comparisonAllowed: true,
      trigger: "scheduled",
      position: 20,
    },
  });
  const baseline = await prisma.rankCheck.create({
    data: {
      publicId: makePublicId("check"),
      keywordId: f.keyword.id,
      checkedAt: date("05:30:00"),
      finishedAt: date("05:31:00"),
      provider: "fixture",
      status: "completed",
      position: 10,
      normalizationVersion: "v1",
      requestedDepth: 100,
    },
  });
  await preference(f.user.id, f.project.id, mode);
  return {
    ...f,
    check,
    baseline,
    target: { kind: "scheduled" as const, projectId: f.project.id, window },
  };
}
export async function preference(
  userId: string,
  projectId: string,
  mode: "all" | "important" | "none",
  topN = 10,
  positionMove = 5,
) {
  const data = {
    checkNotificationSetting: mode,
    checkNotificationTopN: topN,
    checkNotificationPositionMove: positionMove,
  };
  return prisma.notificationPreference.upsert({
    where: { userId_projectId: { userId, projectId } },
    create: { userId, projectId, ...data },
    update: data,
  });
}
export const extraUsers: string[] = [];
export async function addMember(
  projectId: string,
  mode: "all" | "important" | "none" = "important",
  topN = 10,
  positionMove = 5,
) {
  const user = await prisma.user.create({
    data: {
      publicId: makePublicId("usr"),
      email: `${randomUUID()}@example.test`,
      name: "Summary member",
    },
  });
  extraUsers.push(user.id);
  await prisma.membership.create({
    data: { projectId, userId: user.id, publicId: makePublicId("mbr") },
  });
  await preference(user.id, projectId, mode, topN, positionMove);
  return user;
}
export async function makeRun(
  f: Awaited<ReturnType<typeof summaryFixture>>,
  patch: {
    trigger?: string;
    source?: string | null;
    requestedById?: string | null;
    parentRunId?: string;
  } = {},
) {
  return prisma.rankCheckRun.create({
    data: {
      publicId: makePublicId("rcr"),
      projectId: f.project.id,
      trigger: "manual",
      source: "app",
      requestedById: f.user.id,
      status: "completed",
      finishedAt: date("07:00:00"),
      selectionKind: "all",
      selectionSpec: {},
      selectionHash: randomUUID(),
      ...patch,
    },
  });
}
