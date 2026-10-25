import { prisma } from "@/lib/db/prisma";
import { gscAnalyticsProvider } from "@/lib/providers/analytics/gsc";
import { createInspectionRunBudget, type InspectionRetryOptions } from "./inspection-retry";
import { notifyPresenceBudgetExhausted } from "./ops";
import { type SyncPresenceForAllProjectsResult, syncPresenceForProject } from "./sync-project";

export async function syncPresenceForAllProjects(
  now: Date = new Date(),
  options: InspectionRetryOptions = {},
): Promise<SyncPresenceForAllProjectsResult> {
  const runOptions = {
    ...options,
    runBudget: createInspectionRunBudget(),
    runDeadline: options.runDeadline ?? (options.clock ?? Date.now)() + 20 * 60 * 1000,
    dailyExhaustions: new Map<string, Date>(),
  };
  const projects = await prisma.project.findMany({
    select: { id: true },
    orderBy: [
      { defaults: { indexingDiscoveryAt: { sort: "asc", nulls: "first" } } },
      { id: "asc" },
    ],
    where: {
      providerConnections: {
        some: { enabled: true, kind: "analytics", provider: "gsc", status: "connected" },
      },
    },
  });
  const summary = {
    checked: 0,
    deferred: 0,
    deferredProjects: 0,
    failed: 0,
    projects: projects.length,
    signals: 0,
    skipped: 0,
    urls: 0,
  };
  const budgetExhaustions = new Map<
    string,
    {
      deferred: number;
      projectIds: string[];
      property: string;
      propertyAccountKey: string;
      resetAt: Date | null;
    }
  >();

  for (const project of projects) {
    if ((options.clock ?? Date.now)() >= runOptions.runDeadline) {
      summary.deferredProjects += 1;
      continue;
    }
    try {
      const result = await syncPresenceForProject(
        project.id,
        now,
        gscAnalyticsProvider,
        runOptions,
      );
      if (result.status === "skipped") {
        summary.skipped += 1;
        continue;
      }
      summary.checked += result.checked;
      summary.deferred += result.deferred;
      summary.failed += result.failed;
      summary.signals += result.signals;
      summary.urls += result.urls;
      if (result.deferredReason === "daily_budget") {
        const exhausted = budgetExhaustions.get(result.propertyAccountKey) ?? {
          deferred: 0,
          projectIds: [],
          property: result.property,
          propertyAccountKey: result.propertyAccountKey,
          resetAt: result.resetAt,
        };
        exhausted.deferred += result.deferred;
        exhausted.projectIds.push(result.projectId);
        budgetExhaustions.set(result.propertyAccountKey, exhausted);
      }
    } catch (error) {
      summary.failed += 1;
      console.error("[presence] project sync failed", { error, projectId: project.id });
    }
  }

  await Promise.all(
    [...budgetExhaustions.values()].map((exhaustion) => notifyPresenceBudgetExhausted(exhaustion)),
  );

  return summary;
}
