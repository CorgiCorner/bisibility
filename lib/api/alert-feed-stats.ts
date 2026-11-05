import "server-only";
import { prisma } from "@/lib/db/prisma";

const ALERT_FEED_WINDOW_MS = 48 * 60 * 60 * 1000;

export async function getAlertFeedStats(projectId: string) {
  const now = new Date();
  const windowStart = new Date(now.getTime() - ALERT_FEED_WINDOW_MS);
  const [stats] = await prisma.$queryRaw<
    {
      firedInWindowCount: bigint;
      snoozedInWindowCount: bigint;
      totalCount: bigint;
      unacknowledgedCount: bigint;
      snoozedAlertIds: string[] | null;
    }[]
  >`
    SELECT
      COUNT(*) FILTER (WHERE ta."firedAt" >= ${windowStart}) AS "firedInWindowCount",
      COUNT(*) FILTER (
        WHERE ta."firedAt" >= ${windowStart} AND ta."snoozedUntil" > ${now}
      ) AS "snoozedInWindowCount",
      COUNT(*) FILTER (WHERE ta.status = 'firing') AS "unacknowledgedCount",
      ARRAY_AGG(ta."publicId") FILTER (
        WHERE ta."firedAt" >= ${windowStart} AND ta."snoozedUntil" > ${now}
      ) AS "snoozedAlertIds",
      COUNT(*) AS "totalCount"
    FROM "triggered_alerts" ta
    JOIN "alert_rules" ar ON ar.id = ta."ruleId"
    WHERE ar."projectId" = ${projectId}
  `;
  return {
    firedInWindowCount: Number(stats?.firedInWindowCount ?? 0),
    snoozedInWindowCount: Number(stats?.snoozedInWindowCount ?? 0),
    unacknowledgedCount: Number(stats?.unacknowledgedCount ?? 0),
    snoozedAlertIds: stats?.snoozedAlertIds ?? [],
    totalCount: Number(stats?.totalCount ?? 0),
  };
}
