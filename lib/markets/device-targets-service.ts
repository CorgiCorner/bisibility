import { prepareResourceCapacity } from "@/lib/capacity/capacity-extension";
import "server-only";
import { createKeywordBatchSet } from "@/lib/actions/keyword-batch";
import { linkCheckSchedule, resolveCheckSchedule } from "@/lib/actions/keyword-schedule-assignment";
import { writeAudit } from "@/lib/auth/audit";
import type { Prisma } from "@/lib/generated/prisma/client";
import { lockProjectForProviderMutation } from "@/lib/provider-allocations/project-lock";
import {
  type KeywordCreateReview,
  keywordCreateIsReviewed,
} from "@/lib/schedules/keyword-create-write";
import { denormalizedLocationLabel } from "@/lib/serp/location-label";
import type {
  MarketDeviceConfirm,
  MarketDevicePreview,
  MarketDeviceResult,
  MarketDeviceSelection,
} from "./device-targets-input";
import { loadMarketDeviceTargets as load, unavailable } from "./device-targets-load";

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
  admission?: KeywordCreateReview,
): Promise<MarketDeviceResult> {
  const { fingerprint, ...input } = raw;
  await prepareResourceCapacity(tx, { projectId, dimensions: [] });
  await lockProjectForProviderMutation(tx, projectId);
  await tx.$queryRaw`SELECT id FROM project_markets WHERE "projectId"=${projectId} AND "publicId"=${input.marketId} FOR UPDATE`;
  const initial = await load(tx, projectId, input);
  if (initial.outcome !== "loaded") return initial;
  await tx.$queryRaw`SELECT id FROM keywords WHERE "projectId"=${projectId} AND "locationId"=${initial.market.locationId} ORDER BY id FOR UPDATE`;
  const current = await load(tx, projectId, input);
  if (current.outcome !== "loaded") return current;
  if (!keywordCreateIsReviewed(tx, admission) && current.plan.fingerprint !== fingerprint)
    return unavailable("selection_changed");
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
  if (assigned) {
    if (admission) await linkCheckSchedule(tx, projectId, assigned, result.created, admission);
    else await linkCheckSchedule(tx, projectId, assigned, result.created);
  }
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
