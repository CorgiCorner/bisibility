import "server-only";

import { providerLabel } from "@/lib/checks/attempts";
import type { UpcomingProviderSource, UpcomingScheduleSource } from "@/lib/checks/upcoming-view";
import { buildUpcomingView } from "@/lib/checks/upcoming-view";
import { prisma } from "@/lib/db/prisma";
import { isProjectReadOnly } from "@/lib/deployment/project-write-mode";
import { resolveEffectiveSchedule } from "@/lib/keywords/effective-schedule";
import { requireReadableProject } from "./_auth";
import {
  getRequestMonthlySpendCents,
  getRequestProjectDefaults,
  getRequestSerpProviderChain,
} from "./workspace-request-data";

export async function getUpcomingView(projectId: string, options: { now?: Date } = {}) {
  const now = options.now ?? new Date();
  const { project } = await requireReadableProject(projectId);
  const [keywords, defaults, providerChain, spentCents] = await Promise.all([
    prisma.keyword.findMany({
      orderBy: [{ text: "asc" }, { publicId: "asc" }],
      select: {
        id: true,
        publicId: true,
        schedule: {
          select: {
            cronExpression: true,
            frequency: true,
            jitterMinutes: true,
            nextCheckAt: true,
            serpDepth: true,
            timezone: true,
          },
        },
        text: true,
      },
      where: { projectId: project.id },
    }),
    getRequestProjectDefaults(project.id),
    getRequestSerpProviderChain(project.id),
    getRequestMonthlySpendCents(project.id, now),
  ]);
  const schedules = keywords.flatMap((keyword): UpcomingScheduleSource[] => {
    const effective = resolveEffectiveSchedule(keyword.schedule, defaults, keyword.id, now);
    if (!effective.runnable || !effective.nextCheckAt) return [];
    if (!keyword.publicId) throw new Error("Keyword public ID is not available.");
    return [
      {
        frequency: effective.frequency,
        keyword: keyword.text,
        keywordId: keyword.publicId,
        keywordPublicId: keyword.publicId,
        nextCheckAt: effective.nextCheckAt,
        serpDepth: keyword.schedule?.serpDepth ?? defaults?.serpDepth ?? null,
      },
    ];
  });
  const blockedReason = isProjectReadOnly(project.writeMode)
    ? "migration_hold"
    : providerChain.length === 0
      ? "no_provider"
      : spentCents >= project.budgetCapCents
        ? "budget_exhausted"
        : null;

  const providers: UpcomingProviderSource[] = providerChain.map((provider) => ({
    provider: provider.provider,
    providerLabel: providerLabel(provider.provider),
  }));

  return buildUpcomingView({
    blockedReason,
    budgetCapCents: project.budgetCapCents,
    now,
    projectTimezone: defaults?.timezone ?? "UTC",
    providers,
    schedules,
    spentCents,
  });
}
