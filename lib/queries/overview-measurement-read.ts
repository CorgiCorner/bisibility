import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";
import { capturedObservationSelect } from "@/lib/observation/select";
import {
  RankReportCapacityError,
  RankReportSnapshotConflictError,
} from "@/lib/rank-reports/errors";
import { RANK_REPORT_HOST_LIMITS } from "@/lib/rank-reports/host-policy";

/** Page targets, not the metric population. History includes every attempt in the frozen window. */
export async function readOverviewMeasurements(
  where: Prisma.KeywordWhereInput,
  _start: Date,
  asOf: Date,
  db: Prisma.TransactionClient = prisma,
) {
  const selected = { AND: [where, { createdAt: { lte: asOf } }] };
  const [targetCount, checkCount] = await Promise.all([
    db.keyword.count({ where: selected }),
    db.rankCheck.count({ where: { createdAt: { lte: asOf }, keyword: selected } }),
  ]);
  if (
    targetCount > RANK_REPORT_HOST_LIMITS.maxTargets ||
    checkCount > RANK_REPORT_HOST_LIMITS.maxChecks
  )
    throw new RankReportCapacityError();
  const select = {
    _count: { select: { rankChecks: { where: { status: { not: "deferred" } } } } },
    createdAt: true,
    device: true,
    id: true,
    projectId: true,
    locationId: true,
    locationRef: {
      select: { countryCode: true, displayName: true, languageCode: true, languageLabel: true },
    },
    publicId: true,
    text: true,
    rankChecks: {
      orderBy: [{ checkedAt: "desc" }, { id: "desc" }],
      select: {
        id: true,
        publicId: true,
        updatedAt: true,
        checkedAt: true,
        createdAt: true,
        provider: true,
        normalizationVersion: true,
        observationRun: { select: capturedObservationSelect },
        position: true,
        previousPosition: true,
        requestedDepth: true,
        rankingUrl: true,
        status: true,
      },
      where: { createdAt: { lte: asOf } },
    },
    schedule: {
      select: {
        cronExpression: true,
        frequency: true,
        jitterMinutes: true,
        nextCheckAt: true,
        timezone: true,
      },
    },
  } satisfies Prisma.KeywordSelect;
  const result: Array<Prisma.KeywordGetPayload<{ select: typeof select }>> = [];
  let cursor: string | undefined;
  for (;;) {
    const page = await db.keyword.findMany({
      where: selected,
      select,
      orderBy: { id: "asc" },
      take: 500,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    if (page.some((keyword) => keyword.rankChecks.some((check) => check.updatedAt > asOf)))
      throw new RankReportSnapshotConflictError();
    result.push(
      ...page.map((keyword) => ({
        ...keyword,
        rankChecks: keyword.rankChecks.map((check) => ({ ...check, id: check.publicId })),
      })),
    );
    if (page.length < 500) return result;
    const next = page.at(-1)?.id;
    if (!next || next === cursor) throw new Error("Overview target cursor did not advance");
    cursor = next;
  }
}
