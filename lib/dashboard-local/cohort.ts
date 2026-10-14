import { requirePublicId } from "@/lib/db/public-id-resources";
import "server-only";
import type { BusinessProjectScope } from "@/lib/business-location-store/access";
import type { BusinessTransaction } from "@/lib/business-location-store/context";
import { businessIdentityNormalizerVersion } from "@/lib/business-locations/dto";
import type { Prisma } from "@/lib/generated/prisma/client";
import {
  RankReportCapacityError,
  RankReportSnapshotConflictError,
} from "@/lib/rank-reports/errors";
import type { LocalReadFilters } from "./model";
import type { DashboardLocalSelection } from "./selection";
import type { resolveDashboardLocalSubject } from "./subject";

export type LocalSubjectChoice = { label: string; selection: DashboardLocalSelection };

/** One bounded read of heads and their exact versions; no per-item transaction or automatic assignment. */
async function assignments(
  tx: BusinessTransaction,
  projectId: string,
  where: Prisma.BusinessAssignmentHeadWhereInput,
  limit: number,
  asOf: Date,
) {
  const filter = { ...where, projectId };
  const count = await tx.businessAssignmentHead.count({ where: filter });
  if (count > limit) throw new RankReportCapacityError();
  const heads = await tx.businessAssignmentHead.findMany({
    where: filter,
    orderBy: { id: "asc" },
    take: limit,
  });
  if (heads.length !== count) throw new RankReportSnapshotConflictError();
  const rows = await tx.businessAssignmentRevision.findMany({
    where: {
      projectId,
      id: { in: heads.flatMap((head) => (head.currentRevisionId ? [head.currentRevisionId] : [])) },
    },
  });
  const versions = new Map(rows.map((row) => [row.id, row]));
  return heads.map((head) => {
    const row = head.currentRevisionId ? versions.get(head.currentRevisionId) : null;
    if (head.version > 0 && (!row || row.headId !== head.id || row.revision !== head.version))
      throw new RankReportSnapshotConflictError();
    return { head, current: row && row.effectiveFrom <= asOf ? row : null };
  });
}

export async function localSubjectChoices(
  tx: BusinessTransaction,
  scope: BusinessProjectScope,
  limit: number,
  asOf: Date,
): Promise<LocalSubjectChoice[]> {
  const pairs = await assignments(
    tx,
    scope.project.id,
    { scopeType: { in: ["keyword", "market"] } },
    limit,
    asOf,
  );
  const entityIds = pairs.flatMap(({ current }) => (current?.entityId ? [current.entityId] : []));
  const locations = await tx.businessLocation.findMany({
    where: { projectId: scope.project.id, id: { in: entityIds }, role: "subject", state: "active" },
  });
  const identities = await tx.businessIdentityRevision.findMany({
    where: {
      projectId: scope.project.id,
      id: {
        in: locations.flatMap((location) =>
          location.currentRevisionId ? [location.currentRevisionId] : [],
        ),
      },
    },
  });
  const keywords = await tx.keyword.findMany({
    where: {
      projectId: scope.project.id,
      archivedAt: null,
      locationRef: {
        projectMarkets: { none: { projectId: scope.project.id, status: { not: "active" } } },
      },
      id: {
        in: pairs
          .filter(({ head }) => head.scopeType === "keyword")
          .map(({ head }) => head.scopeId),
      },
    },
    select: { id: true, publicId: true, text: true },
  });
  const markets = await tx.projectMarket.findMany({
    where: {
      projectId: scope.project.id,
      status: "active",
      id: {
        in: pairs.filter(({ head }) => head.scopeType === "market").map(({ head }) => head.scopeId),
      },
    },
    select: { id: true, publicId: true, name: true },
  });
  const locationById = new Map(locations.map((location) => [location.id, location]));
  const identityById = new Map(identities.map((identity) => [identity.id, identity]));
  const choices: LocalSubjectChoice[] = [];
  for (const { head, current } of pairs) {
    if (!current?.entityId || !current.identityRevisionId) continue;
    const location = locationById.get(current.entityId),
      identity = identityById.get(current.identityRevisionId);
    if (
      !location ||
      location.currentRevisionId !== current.identityRevisionId ||
      !identity ||
      identity.entityId !== location.id ||
      identity.normalizerVersion !== businessIdentityNormalizerVersion ||
      identity.effectiveFrom > asOf
    )
      continue;
    const target =
      head.scopeType === "keyword"
        ? keywords.find((keyword) => keyword.id === head.scopeId)
        : markets.find((market) => market.id === head.scopeId);
    if (!target || (head.scopeType !== "keyword" && head.scopeType !== "market")) continue;
    const snapshot = identity.snapshot;
    const name =
      snapshot &&
      typeof snapshot === "object" &&
      !Array.isArray(snapshot) &&
      "name" in snapshot &&
      typeof snapshot.name === "string"
        ? snapshot.name
        : location.publicId;
    choices.push({
      label: `${"text" in target ? target.text : target.name} · ${name}`,
      selection: {
        scope:
          head.scopeType === "keyword"
            ? { kind: "keyword", id: requirePublicId(target.publicId, "kw") }
            : { kind: "market", id: requirePublicId(target.publicId, "pmkt") },
        locationId: requirePublicId(location.publicId, "biz"),
        identityRevisionId: identity.id,
        assignmentRevision: current.revision,
      },
    });
  }
  return choices.sort(
    (a, b) =>
      a.label.localeCompare(b.label) ||
      a.selection.locationId.localeCompare(b.selection.locationId),
  );
}

export async function localAssignmentCohort(
  tx: BusinessTransaction,
  scope: BusinessProjectScope,
  selected: DashboardLocalSelection,
  subject: Awaited<ReturnType<typeof resolveDashboardLocalSubject>>,
  filters: LocalReadFilters,
  maxTargets: number,
  asOf: Date,
) {
  const market =
    selected.scope.kind === "market"
      ? await tx.projectMarket.findFirst({
          where: {
            id: subject.assigned.reference.scopeId,
            projectId: scope.project.id,
            status: "active",
          },
          select: { locationId: true },
        })
      : null;
  if (selected.scope.kind === "market" && !market) throw new RankReportSnapshotConflictError();
  const where: Prisma.KeywordWhereInput = {
    projectId: scope.project.id,
    archivedAt: null,
    createdAt: { lte: asOf },
    locationRef: {
      projectMarkets: { none: { projectId: scope.project.id, status: { not: "active" } } },
      ...(filters.canonicalLocationKey ? { canonicalKey: filters.canonicalLocationKey } : {}),
    },
    ...(selected.scope.kind === "keyword"
      ? { publicId: selected.scope.id }
      : { locationId: market?.locationId }),
    ...(filters.device === "all" ? {} : { device: filters.device }),
    ...(filters.marketIds.length ? { AND: [{ locationId: { in: filters.marketIds } }] } : {}),
    ...(filters.tag ? { tags: { some: { tag: { name: filters.tag } } } } : {}),
  };
  const count = await tx.keyword.count({ where });
  if (count > maxTargets) throw new RankReportCapacityError();
  const candidates = await tx.keyword.findMany({
    where,
    orderBy: { id: "asc" },
    take: maxTargets,
    select: { id: true, publicId: true, text: true, locationId: true, device: true },
  });
  if (candidates.length !== count) throw new RankReportSnapshotConflictError();
  const markets = await tx.projectMarket.findMany({
    where: {
      projectId: scope.project.id,
      status: "active",
      locationId: { in: candidates.map(({ locationId }) => locationId) },
    },
    select: { id: true, locationId: true },
  });
  const pairs = await assignments(
    tx,
    scope.project.id,
    {
      OR: [
        { scopeType: "keyword", scopeId: { in: candidates.map(({ id }) => id) } },
        { scopeType: "market", scopeId: { in: markets.map(({ id }) => id) } },
      ],
    },
    maxTargets * 2,
    asOf,
  );
  const byScope = new Map(
    pairs.map((pair) => [`${pair.head.scopeType}:${pair.head.scopeId}`, pair]),
  );
  const included: typeof candidates = [],
    exclusions: Array<{
      keywordId: string;
      reason: "unassigned" | "different_subject" | "assignment_unavailable";
    }> = [];
  for (const keyword of candidates) {
    const assignedMarket = markets.find(({ locationId }) => locationId === keyword.locationId);
    // A present keyword head, including explicit unassignment, prevents market inheritance.
    const pair =
      byScope.get(`keyword:${keyword.id}`) ??
      (assignedMarket ? byScope.get(`market:${assignedMarket.id}`) : undefined);
    const assignment = pair?.current;
    if (!assignment?.entityId)
      exclusions.push({
        keywordId: keyword.publicId,
        reason: pair && !assignment ? "assignment_unavailable" : "unassigned",
      });
    else if (
      assignment.entityId !== subject.row.id ||
      assignment.identityRevisionId !== selected.identityRevisionId
    )
      exclusions.push({ keywordId: keyword.publicId, reason: "different_subject" });
    else included.push(keyword);
  }
  return { included, exclusions };
}
