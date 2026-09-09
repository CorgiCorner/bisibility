import "server-only";
import { prisma } from "@/lib/db/prisma";

const ALERT_FEED_WINDOW_MS = 48 * 60 * 60 * 1000;

export async function getAlertFeedStats(projectId: string) {
  const now = new Date();
  const windowStart = new Date(now.getTime() - ALERT_FEED_WINDOW_MS);
  const [stats] = await prisma.$queryRaw<
    { firedInWindowCount: bigint; snoozedInWindowCount: bigint; totalCount: bigint }[]
  >`
    SELECT
      COUNT(*) FILTER (WHERE ta."firedAt" >= ${windowStart}) AS "firedInWindowCount",
      COUNT(*) FILTER (
        WHERE ta."firedAt" >= ${windowStart} AND ta."snoozedUntil" > ${now}
      ) AS "snoozedInWindowCount",
      COUNT(*) AS "totalCount"
    FROM "triggered_alerts" ta
    JOIN "alert_rules" ar ON ar.id = ta."ruleId"
    WHERE ar."projectId" = ${projectId}
  `;
  return {
    firedInWindowCount: Number(stats?.firedInWindowCount ?? 0),
    snoozedInWindowCount: Number(stats?.snoozedInWindowCount ?? 0),
    totalCount: Number(stats?.totalCount ?? 0),
  };
}
