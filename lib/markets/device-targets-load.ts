import "server-only";
import type { Prisma } from "@/lib/generated/prisma/client";
import type { MarketDeviceSelection } from "./device-targets-input";
import { MARKET_DEVICE_SOURCE_MAX, marketDevicePlan } from "./device-targets-plan";
export const unavailable = (
  reason:
    | "market_unavailable"
    | "selection_too_large"
    | "selection_changed"
    | "schedule_unavailable",
) => ({ outcome: "unavailable" as const, reason });
export async function loadMarketDeviceTargets(
  tx: Pick<Prisma.TransactionClient, "projectMarket" | "checkSchedule" | "keyword">,
  projectId: string,
  input: MarketDeviceSelection,
) {
  const market = await tx.projectMarket.findFirst({
    where: { publicId: input.marketId, projectId, status: "active" },
    include: { location: true },
  });
  if (!market) return unavailable("market_unavailable");
  const schedule = input.scheduleId
    ? await tx.checkSchedule.findFirst({
        where: {
          publicId: input.scheduleId,
          projectId,
          archivedAt: null,
          enabled: true,
        },
      })
    : null;
  if (input.scheduleId && !schedule) return unavailable("schedule_unavailable");
  const keywords = await tx.keyword.findMany({
    where: { projectId, locationId: market.locationId },
    orderBy: { publicId: "asc" },
    take: MARKET_DEVICE_SOURCE_MAX + 1,
    select: {
      publicId: true,
      text: true,
      device: true,
      archivedAt: true,
      targetUrl: true,
      topic: true,
      intent: true,
      tags: { orderBy: { tagId: "asc" }, select: { tag: { select: { name: true } } } },
    },
  });
  const scheduleScope = schedule
    ? [
        schedule.publicId,
        schedule.name,
        schedule.frequency,
        schedule.cronExpression,
        schedule.timeOfDay,
        schedule.timezone,
        schedule.jitterMinutes,
        schedule.serpDepth,
        schedule.providerPolicy,
        schedule.updatedAt,
      ]
    : null;
  const plan = marketDevicePlan(keywords, input, scheduleScope);
  return plan.outcome === "ready" ? { outcome: "loaded" as const, market, schedule, plan } : plan;
}
