import "server-only";

import { isPublicIdOfType } from "@/lib/db/public-id";
import type { Prisma } from "@/lib/generated/prisma/client";
import type { authorizeRankReportScope } from "./access";
import {
  RankReportCapacityError,
  RankReportSelectionError,
  RankReportSnapshotConflictError,
} from "./errors";
import type { RankReportLimits, RankReportPolicy, RankReportTarget } from "./model";

const itemSelect = {
  blockPosition: true,
  businessName: true,
  cid: true,
  createdAt: true,
  domain: true,
  id: true,
  mapsUrl: true,
  rankScale: true,
  promotion: true,
  sourcePage: true,
  sourceBlockId: true,
  sourceOrdinal: true,
  observedAt: true,
  ordinal: true,
  placeId: true,
  positionInBlock: true,
  rankAbsolute: true,
  rankGroup: true,
  resultKind: true,
  title: true,
  url: true,
} as const;
const checkSelect = {
  attemptCount: true,
  checkedAt: true,
  createdAt: true,
  deferredReason: true,
  degradedToCountry: true,
  errorCode: true,
  expectedUrlAtCheck: true,
  finishedAt: true,
  keywordId: true,
  normalizationVersion: true,
  position: true,
  previousPosition: true,
  provider: true,
  publicId: true,
  rankingUrl: true,
  requestedDepth: true,
  startedAt: true,
  status: true,
  updatedAt: true,
} as const;

export function assertRetainedObservationProject(
  observation: { projectId?: string } | null,
  projectId: string,
) {
  if (observation && observation.projectId !== projectId) throw new RankReportSelectionError();
}

export type RankReportTargetMetadata = Pick<
  RankReportTarget,
  "baselineWindow" | "expectedScope" | "requestedGeo" | "volume" | "freshForMs"
>;

export async function loadRetainedRankReportTargets(
  tx: Prisma.TransactionClient,
  scope: Pick<Awaited<ReturnType<typeof authorizeRankReportScope>>, "keywords" | "project">,
  policy: RankReportPolicy,
  limits: RankReportLimits,
  metadata: ReadonlyMap<string, RankReportTargetMetadata>,
  includeItems: boolean,
  onlyCheckPublicId?: string,
): Promise<RankReportTarget[]> {
  const ids = scope.keywords.map(({ id }) => id);
  if (ids.length > limits.maxTargets) throw new RankReportCapacityError();
  // Read all retained checks needed by the shared resolver or refuse capacity.
  const where = {
    createdAt: { lte: policy.asOf },
    keywordId: { in: ids },
    keyword: { projectId: scope.project.id },
    ...(onlyCheckPublicId ? { publicId: onlyCheckPublicId } : {}),
  };
  const [count, itemCount] = await Promise.all([
    tx.rankCheck.count({ where }),
    includeItems
      ? tx.observationItem.count({
          where: {
            createdAt: { lte: policy.asOf },
            observationRun: {
              createdAt: { lte: policy.asOf },
              projectId: scope.project.id,
              rankCheck: where,
            },
          },
        })
      : Promise.resolve(0),
  ]);
  if (count > limits.maxChecks || itemCount > limits.maxItems) throw new RankReportCapacityError();
  const readBatch = (cursor?: string) =>
    tx.rankCheck.findMany({
      ...(cursor ? { cursor: { publicId: cursor }, skip: 1 } : {}),
      take: 500,
      orderBy: [{ createdAt: "asc" }, { publicId: "asc" }],
      select: {
        ...checkSelect,
        observationRun: {
          select: {
            completeness: true,
            configuredScope: true,
            createdAt: true,
            effectiveScope: true,
            engine: true,
            executedAt: true,
            projectId: true,
            provider: true,
            requestPolicy: true,
            surface: true,
            items: {
              orderBy: [{ resultKind: "asc" }, { ordinal: "asc" }, { id: "asc" }],
              select: itemSelect,
              where: {
                createdAt: { lte: policy.asOf },
                ...(includeItems ? {} : { id: { in: [] } }),
              },
            },
          },
        },
      },
      where,
    });
  const checks: Awaited<ReturnType<typeof readBatch>> = [];
  let cursor: string | undefined;
  while (checks.length < count) {
    const batch = await readBatch(cursor);
    if (!batch.length || checks.length + batch.length > count)
      throw new RankReportSnapshotConflictError();
    checks.push(...batch);
    cursor = batch.at(-1)?.publicId;
    if (!cursor) throw new RankReportSnapshotConflictError();
  }
  if (checks.some((check) => !isPublicIdOfType(check.publicId, "check")))
    throw new RankReportSelectionError();
  if (checks.some((check) => check.updatedAt > policy.asOf))
    throw new RankReportSnapshotConflictError();
  const byId = new Map(
    scope.keywords.map(({ id, publicId }) => {
      const value = metadata.get(publicId);
      const target: RankReportTarget = {
        checks: [],
        id: publicId,
        volume: value?.volume ?? null,
        ...(value?.baselineWindow !== undefined ? { baselineWindow: value.baselineWindow } : {}),
        ...(value?.freshForMs !== undefined ? { freshForMs: value.freshForMs } : {}),
        ...(value?.expectedScope !== undefined ? { expectedScope: value.expectedScope } : {}),
        ...(value?.requestedGeo !== undefined ? { requestedGeo: value.requestedGeo } : {}),
      };
      return [id, target] as const;
    }),
  );
  const result: RankReportTarget[] = [...byId.values()];
  const grouped = new Map(
    result.map((target) => [target.id, [] as RankReportTarget["checks"][number][]]),
  );
  for (const check of checks) {
    assertRetainedObservationProject(check.observationRun, scope.project.id);
    const { keywordId, publicId, ...retained } = check;
    const target = byId.get(keywordId);
    if (!target) throw new RankReportSelectionError();
    const targetChecks = grouped.get(target.id);
    if (!targetChecks) throw new RankReportSelectionError();
    targetChecks.push({
      ...retained,
      id: publicId,
      observationRun:
        retained.observationRun && retained.observationRun.createdAt <= policy.asOf
          ? retained.observationRun
          : null,
    });
  }
  return result
    .map((target) => ({ ...target, checks: grouped.get(target.id) ?? [] }))
    .sort((a, b) => a.id.localeCompare(b.id));
}
