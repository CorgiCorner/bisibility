import "server-only";
import { createKeywordBatchSet } from "@/lib/actions/keyword-batch";
import { linkCheckSchedule, resolveCheckSchedule } from "@/lib/actions/keyword-schedule-assignment";
import { writeAudit } from "@/lib/auth/audit";
import type { Prisma } from "@/lib/generated/prisma/client";
import { lockProjectForProviderMutation } from "@/lib/provider-allocations/project-lock";
import { denormalizedLocationLabel } from "@/lib/serp/location-label";
import type {
  MarketDeviceConfirm,
  MarketDevicePreview,
  MarketDeviceResult,
  MarketDeviceSelection,
} from "./device-targets-input";
import { MARKET_DEVICE_SOURCE_MAX, marketDevicePlan } from "./device-targets-plan";

const unavailable = (
  reason:
    | "market_unavailable"
    | "selection_too_large"
    | "selection_changed"
    | "schedule_unavailable",
) => ({ outcome: "unavailable" as const, reason });
async function load(tx: Prisma.TransactionClient, projectId: string, input: MarketDeviceSelection) {
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
          frequency: { notIn: ["manual", "paused"] },
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
export async function previewMarketDeviceTargets(
  tx: Prisma.TransactionClient,
  projectId: string,
  input: MarketDeviceSelection,
): Promise<MarketDevicePreview> {
  const result = await load(tx, projectId, input);
  if (result.outcome !== "loaded") return result;
  const { missing: _, ...plan } = result.plan;
  return { ...plan, scheduleName: result.schedule?.name ?? null };
}
/** No check is dispatched here. Only newly created rows receive the explicit schedule choice. */
export async function addMarketDeviceTargets(
  tx: Prisma.TransactionClient,
  actorId: string,
  projectId: string,
  raw: MarketDeviceConfirm,
): Promise<MarketDeviceResult> {
  const { fingerprint, ...input } = raw;
  await lockProjectForProviderMutation(tx, projectId);
  await tx.$queryRaw`SELECT id FROM project_markets WHERE "projectId"=${projectId} AND "publicId"=${input.marketId} FOR UPDATE`;
  const initial = await load(tx, projectId, input);
  if (initial.outcome !== "loaded") return initial;
  await tx.$queryRaw`SELECT id FROM keywords WHERE "projectId"=${projectId} AND "locationId"=${initial.market.locationId} ORDER BY id FOR UPDATE`;
  const current = await load(tx, projectId, input);
  if (current.outcome !== "loaded") return current;
  if (current.plan.fingerprint !== fingerprint) return unavailable("selection_changed");
  if (!current.plan.missing.length) return { outcome: "created", created: 0 };
  const assigned = await resolveCheckSchedule(tx, projectId, input.scheduleId);
  const result = await createKeywordBatchSet(
    tx,
    projectId,
    current.plan.missing.map((source) => ({
      device: input.device,
      keyword: source.text,
      location: denormalizedLocationLabel(current.market.location),
      locationId: current.market.locationId,
      schedule: null,
      tags: source.tags.map(({ tag }) => tag.name),
      targetUrl: source.targetUrl,
      topic: source.topic,
      intent: source.intent,
    })),
  );
  if (result.restored.length || result.created.length !== current.plan.newCheckCount)
    throw new Error("Device target selection changed.");
  if (assigned) await linkCheckSchedule(tx, projectId, assigned, result.created);
  if (result.created.length)
    await writeAudit(
      {
        action: "keyword.market_device_add",
        actorId,
        projectId,
        targetId: input.marketId,
        targetType: "project_market",
        after: {
          device: input.device,
          scheduleId: assigned?.publicId ?? null,
          keywordIds: result.created.map((row) => row.publicId),
        },
      },
      tx,
    );
  return { outcome: "created", created: result.created.length };
}
