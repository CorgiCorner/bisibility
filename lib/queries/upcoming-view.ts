import "server-only";

import { providerLabel } from "@/lib/checks/attempts";
import type { UpcomingProviderSource, UpcomingScheduleSource } from "@/lib/checks/upcoming-view";
import { buildUpcomingView } from "@/lib/checks/upcoming-view";
import type { DateFormat } from "@/lib/dates/format";
import { prisma } from "@/lib/db/prisma";
import { isProjectReadOnly } from "@/lib/deployment/project-write-mode";
import { keywordMembershipSelect } from "@/lib/keywords/membership-select";
import { createKeywordMembershipProjector } from "@/lib/keywords/schedule-membership";
import { rankCheckBudgetAmounts } from "@/lib/metering/rank-check-budget-read";
import { requireReadableProject } from "./_auth";
import { getRequestProjectDefaults, getRequestSerpProviderChain } from "./workspace-request-data";

export async function getUpcomingView(
  projectId: string,
  options: { dateFormat?: DateFormat; now?: Date } = {},
) {
  const now = options.now ?? new Date();
  const { project } = await requireReadableProject(projectId);
  const [keywords, defaults, providerChain, reading] = await Promise.all([
    prisma.keyword.findMany({
      orderBy: [{ text: "asc" }, { publicId: "asc" }],
      select: {
        checkSchedule: { select: { ...keywordMembershipSelect, serpDepth: true } },
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
      where: { projectId: project.id, archivedAt: null },
    }),
    getRequestProjectDefaults(project.id),
    getRequestSerpProviderChain(project.id),
    rankCheckBudgetAmounts(project.id, now),
  ]);
  const { capCents, reservedCents, spentCents } = reading;
  const membership = createKeywordMembershipProjector(now);
  const schedules = keywords.flatMap((keyword): UpcomingScheduleSource[] => {
    const effective = membership(keyword.checkSchedule, keyword.id, defaults?.timezone ?? "UTC");
    if (!effective.nextCheckAt) return [];
    if (!keyword.publicId) throw new Error("Keyword public ID is not available.");
    return [
      {
        frequency: effective.frequency,
        keyword: keyword.text,
        keywordId: keyword.publicId,
        keywordPublicId: keyword.publicId,
        nextCheckAt: effective.nextCheckAt,
        serpDepth:
          keyword.checkSchedule?.serpDepth ??
          keyword.schedule?.serpDepth ??
          defaults?.serpDepth ??
          null,
      },
    ];
  });
  const exhausted =
    !reading.present ||
    reading.uncertain ||
    (reading.limited && spentCents + reservedCents >= capCents);
  const blockedReason = isProjectReadOnly(project.writeMode)
    ? "migration_hold"
    : providerChain.length === 0
      ? "no_provider"
      : !reading.present
        ? "budget_missing"
        : reading.uncertain
          ? "usage_reconciliation_required"
          : exhausted
            ? "budget_exhausted"
            : null;

  const providers: UpcomingProviderSource[] = providerChain.map((provider) => ({
    provider: provider.provider,
    providerLabel: providerLabel(provider.provider),
  }));

  return buildUpcomingView({
    blockedReason,
    monthlyCapCents: capCents,
    dateFormat: options.dateFormat ?? "iso",
    now,
    projectTimezone: defaults?.timezone ?? "UTC",
    providers,
    schedules,
    spentCents,
  });
}
