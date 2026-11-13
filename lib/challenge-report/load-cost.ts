import "server-only";

import type { CostBilling, CostSplit, MonthlyCostItem } from "@/lib/cost-items/monthly";
import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@/lib/generated/prisma/client";
import { canonicalUsageSql } from "@/lib/metering/usage-sql";
import { dateFromKey } from "@/lib/search-insights/dates";
import { periodProjectMinor } from "./cost-period";
import type { ChallengePeriod } from "./period";
import { eachDate } from "./period";
import { buildCostTile } from "./tiles-outcomes";

const AI_FEATURES = new Set(["ai_tracking", "ai_visibility"]);
const RANK_FEATURES = new Set(["rank_check"]);

function dayKey(value: Date) {
  return value.toISOString().slice(0, 10);
}

export async function loadCostTile(projectId: string, period: ChallengePeriod) {
  const project = await prisma.project.findUnique({
    select: { ownerId: true },
    where: { id: projectId },
  });
  if (!project)
    return buildCostTile({
      aiAnswersMinor: 0,
      days: period.days,
      other: [],
      rankChecksMinor: 0,
      subscriptions: [],
    });
  const items = await prisma.costItem.findMany({
    include: {
      priceChanges: { orderBy: { effectiveFrom: "asc" } },
      projects: { select: { basisPoints: true, projectId: true } },
    },
    where: { ownerId: project.ownerId, projects: { some: { projectId } } },
  });
  const days = eachDate(period.from, period.to);
  const subscriptions = new Map<string, number>();
  const other = new Map<string, number>();
  for (const item of items) {
    const model: MonthlyCostItem = {
      amountMinor: item.amountMinor,
      billing: item.billing as CostBilling,
      endedOn: item.endedOn ? dayKey(item.endedOn) : null,
      priceChanges: item.priceChanges.map((change) => ({
        amountMinor: change.amountMinor,
        effectiveFrom: dayKey(change.effectiveFrom),
        reason: change.reason as MonthlyCostItem["priceChanges"][number]["reason"],
      })),
      projects: item.projects.map((link) => ({
        basisPoints: link.basisPoints,
        projectId: link.projectId,
      })),
      split: item.split as CostSplit,
      startedOn: dayKey(item.startedOn),
    };
    const share = periodProjectMinor(model, projectId, days);
    if (share <= 0) continue;
    const currency = item.currency.trim().toUpperCase();
    const target = item.billing === "one_off" ? other : subscriptions;
    target.set(currency, (target.get(currency) ?? 0) + share);
  }
  const from = dateFromKey(period.from);
  const end = dateFromKey(period.to);
  end.setUTCDate(end.getUTCDate() + 1);
  const spend = await prisma.$queryRaw<{ feature: string | null; total: unknown }[]>(Prisma.sql`
    SELECT feature, COALESCE(SUM("budgetCents"), 0) AS total
    FROM (${canonicalUsageSql()}) u
    WHERE "projectId" = ${projectId}
      AND "createdAt" >= ${from}
      AND "createdAt" < ${end}
      AND NOT cached
    GROUP BY feature
  `);
  let rankChecksMinor = 0;
  let aiAnswersMinor = 0;
  let otherSpend = 0;
  for (const row of spend) {
    const minor = Math.max(0, Math.round(Number(row.total ?? 0)));
    const feature = row.feature ?? "";
    if (RANK_FEATURES.has(feature)) rankChecksMinor += minor;
    else if (AI_FEATURES.has(feature)) aiAnswersMinor += minor;
    else otherSpend += minor;
  }
  if (otherSpend > 0) other.set("USD", (other.get("USD") ?? 0) + otherSpend);
  return buildCostTile({
    aiAnswersMinor,
    days: period.days,
    other: [...other.entries()].map(([currency, minor]) => ({ currency, minor })),
    rankChecksMinor,
    subscriptions: [...subscriptions.entries()].map(([currency, minor]) => ({ currency, minor })),
  });
}
