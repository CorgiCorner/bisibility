import "server-only";

import { prisma } from "@/lib/db/prisma";
import { gscPropertyContainsUrl } from "@/lib/providers/analytics/gsc-property-membership";
import { currentPageIndexingScope } from "./current-rows";
import { type DeindexRow, deindexRows } from "./deindex-model";
import type { IndexingSourceCounts } from "./progress-model";
import { type ReasonCountRow, reasonCountRows } from "./reason-change";

const DAY_MS = 24 * 60 * 60 * 1000;

export type IndexingOverview = {
  drops: DeindexRow[];
  reasons: { asOf: string; derived: boolean; rows: ReasonCountRow[] };
  sources: IndexingSourceCounts;
};

export async function loadIndexingOverview(
  projectId: string,
  property: string,
  now = new Date(),
): Promise<IndexingOverview> {
  const cutoff7 = new Date(now.getTime() - 7 * DAY_MS);
  const cutoff90 = new Date(now.getTime() - 90 * DAY_MS);
  const { where } = await currentPageIndexingScope(projectId, property, false);
  const [rows, changes, signals] = await Promise.all([
    prisma.urlPresence.findMany({
      where,
      select: {
        checkedAt: true,
        coverageState: true,
        inspectionError: true,
        inspectionFailedAt: true,
        source: true,
        url: true,
        verdict: true,
      },
    }),
    prisma.urlPresenceChange.findMany({
      where: { projectId, at: { gt: cutoff90 } },
      orderBy: [{ at: "asc" }, { id: "asc" }],
      select: { at: true, next: true, previous: true, url: true },
    }),
    prisma.signal.findMany({
      where: { projectId, type: "url.deindexed", happenedAt: { gte: cutoff90 } },
      orderBy: { happenedAt: "desc" },
      select: { happenedAt: true, payload: true, publicId: true, url: true },
    }),
  ]);
  const inProperty = (url: string) => gscPropertyContainsUrl(property, url);
  const sources: IndexingSourceCounts = { keyword_target: 0, manual: 0, sitemap: 0 };
  for (const row of rows) sources[row.source] += 1;
  const propertyChanges = changes.filter((change) => inProperty(change.url));
  const reasons = reasonCountRows({ changes: propertyChanges, cutoff: cutoff7, rows });
  return {
    drops: deindexRows({
      changes: propertyChanges,
      signals: signals.flatMap((signal) =>
        signal.url && inProperty(signal.url)
          ? [
              {
                at: signal.happenedAt,
                id: signal.publicId,
                payload: signal.payload,
                url: signal.url,
              },
            ]
          : [],
      ),
      since: cutoff90,
    }),
    reasons: { asOf: cutoff7.toISOString(), derived: reasons.derived, rows: reasons.rows },
    sources,
  };
}
