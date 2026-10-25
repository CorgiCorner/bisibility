import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";
import { projectDate } from "@/lib/presence/project-day";
import { gscPropertyContainsUrl } from "@/lib/providers/analytics/gsc-property-membership";
import { pageIndexingGroup } from "./report";
import type { IndexingDay, SitemapSnapshot, SitemapSnapshotRow } from "./ui-model";

export async function storedIndexingDays(
  projectId: string,
  property: string,
  now = new Date(),
): Promise<IndexingDay[]> {
  const defaults = await prisma.projectDefaults.findUnique({ where: { projectId } });
  const through = projectDate(now, defaults?.timezone ?? "UTC");
  const since = new Date(new Date(`${through}T00:00:00Z`).getTime() - 89 * 86400000)
    .toISOString()
    .slice(0, 10);
  const rows = await prisma.pageIndexingDay.findMany({
    where: { projectId, property, date: { gte: since, lte: through } },
    orderBy: { date: "asc" },
  });
  return rows.map(
    ({ date, indexed, notIndexed, failed, checked, total, inspectedThatDay, stop, changes }) => ({
      date,
      indexed,
      notIndexed,
      failed,
      checked,
      total,
      inspectedThatDay,
      stop: stop === "off" || stop === "quota" ? stop : null,
      changes: changes as IndexingDay["changes"],
    }),
  );
}

export async function storedSitemapSnapshot(
  projectId: string,
  property: string,
): Promise<SitemapSnapshot> {
  return prisma.$transaction((tx) => readSitemapSnapshot(tx, projectId, property), {
    isolationLevel: "RepeatableRead",
  });
}

async function readSitemapSnapshot(
  db: Prisma.TransactionClient,
  projectId: string,
  property: string,
): Promise<SitemapSnapshot> {
  const defaults = await db.projectDefaults.findUnique({ where: { projectId } });
  const sameProperty = defaults?.indexingSitemapProperty === property;
  const [sitemaps, inspections] = await Promise.all([
    sameProperty
      ? db.pageIndexingSitemap.findMany({ where: { projectId }, orderBy: { path: "asc" } })
      : [],
    db.urlPresence.findMany({ where: { projectId, sitemapUrl: { not: null } } }),
  ]);
  const checks = new Map<string, SitemapSnapshotRow["checks"]>();
  for (const row of inspections) {
    if (!row.sitemapUrl || !gscPropertyContainsUrl(property, row.url)) continue;
    const counts = checks.get(row.sitemapUrl) ?? {
      indexed: 0,
      notIndexed: 0,
      failed: 0,
      notChecked: 0,
    };
    const group = pageIndexingGroup(row);
    counts[
      group === "indexed"
        ? "indexed"
        : group === "not_indexed"
          ? "notIndexed"
          : group === "inspection_failed"
            ? "failed"
            : "notChecked"
    ] += 1;
    checks.set(row.sitemapUrl, counts);
  }
  const empty = { indexed: 0, notIndexed: 0, failed: 0, notChecked: 0 };
  const rows: SitemapSnapshotRow[] = sitemaps.map(
    ({
      id: _id,
      projectId: _projectId,
      readAt: _readAt,
      lastSubmitted,
      lastDownloaded,
      ...row
    }) => ({
      ...row,
      lastSubmitted: lastSubmitted?.toISOString() ?? null,
      lastDownloaded: lastDownloaded?.toISOString() ?? null,
      noLongerSubmitted: false,
      checks: checks.get(row.path) ?? { ...empty },
    }),
  );
  const listed = new Set(rows.map((row) => row.path));
  // Only a successful read can prove an origin is no longer submitted.
  if (sameProperty && defaults?.indexingSitemapReadAt)
    for (const [path, counts] of checks) {
      if (listed.has(path)) continue;
      rows.push({
        path,
        parentPath: null,
        isIndex: false,
        childCount: 0,
        contentType: "",
        isPending: false,
        errors: 0,
        warnings: 0,
        lastSubmitted: null,
        lastDownloaded: null,
        submitted: 0,
        noLongerSubmitted: true,
        checks: counts,
      });
    }
  return {
    readAt: sameProperty ? (defaults?.indexingSitemapReadAt?.toISOString() ?? null) : null,
    lastError:
      defaults?.indexingSitemapLastError === "permission"
        ? "permission"
        : defaults?.indexingSitemapLastError === "unavailable"
          ? "unavailable"
          : null,
    lastErrorAt: defaults?.indexingSitemapLastErrorAt?.toISOString() ?? null,
    rows,
  };
}
