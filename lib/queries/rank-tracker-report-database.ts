import "server-only";

import type { Prisma } from "@/lib/generated/prisma/client";
import { RankReportCapacityError } from "@/lib/rank-reports/errors";
import type { RankReportLimits } from "@/lib/rank-reports/model";

const schedule = {
  cronExpression: true,
  frequency: true,
  jitterMinutes: true,
  lastCheckedAt: true,
  nextCheckAt: true,
  serpDepth: true,
  timezone: true,
} as const;
const location = {
  canonicalKey: true,
  cityName: true,
  countryCode: true,
  displayName: true,
  gl: true,
  hl: true,
  id: true,
  kind: true,
  languageLabel: true,
} as const;

/** Current active membership is explicit; this does not reconstruct a historical target cohort. */
export async function loadRankTrackerReportCandidates(
  tx: Prisma.TransactionClient,
  projectId: string,
  limits: RankReportLimits,
  pausedSchedules: "include_retained" | "exclude",
  asOf?: Date,
  selection?: Prisma.KeywordWhereInput,
) {
  const base = {
    archivedAt: null,
    projectId,
    ...(asOf ? { createdAt: { lte: asOf } } : {}),
    locationRef: { projectMarkets: { none: { projectId, status: { not: "active" as const } } } },
    ...(pausedSchedules === "exclude"
      ? { OR: [{ schedule: null }, { schedule: { frequency: { not: "paused" as const } } }] }
      : {}),
  };
  const where = selection ? { AND: [base, selection] } : base;
  const count = await tx.keyword.count({ where });
  if (count > limits.maxTargets) throw new RankReportCapacityError();
  const rows = await tx.keyword.findMany({
    orderBy: [{ createdAt: "desc" }, { publicId: "asc" }],
    select: {
      checkSchedule: { select: { name: true, publicId: true, serpDepth: true } },
      createdAt: true,
      device: true,
      id: true,
      intent: true,
      location: true,
      locationRef: { select: location },
      publicId: true,
      schedule: { select: schedule },
      tags: { select: { tag: { select: { name: true } } } },
      targetUrl: true,
      text: true,
      topic: true,
    },
    where,
  });
  const defaults = await tx.projectDefaults.findUnique({ select: schedule, where: { projectId } });
  const markets = await tx.projectMarket.findMany({
    where: { projectId },
    orderBy: { id: "asc" },
    take: limits.maxTargets + 1,
    select: { location: { select: location } },
  });
  if (markets.length > limits.maxTargets) throw new RankReportCapacityError();
  return { defaults, rows, registeredLocations: markets.map((market) => market.location) };
}
