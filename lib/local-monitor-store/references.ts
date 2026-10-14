import { loadBusinessLocation } from "@/lib/business-location-store/location-repository";
import { localDigest, localKeywordSourceHash } from "@/lib/local-monitoring-store/canonical";
import type { LocalTransaction } from "@/lib/local-monitoring-store/context";
import { localKeywordSelect } from "@/lib/local-monitoring-store/repository";
import { isScheduledFrequency } from "@/lib/rank-check/schedule-frequency";
import type { FrozenMonitorCalendar, MonitorKeyword } from "./model";
import { LocalMonitorConflictError } from "./model";
import type { MonitorDefinitionInput } from "./schema";

export async function loadDefinitionReferences(
  tx: LocalTransaction,
  projectId: string,
  input: MonitorDefinitionInput,
) {
  const { row } = await loadBusinessLocation(tx, projectId, input.locationId);
  await tx.$queryRaw`SELECT id FROM business_locations WHERE id=${row.id} AND "projectId"=${projectId} FOR SHARE`;
  const current = await loadBusinessLocation(tx, projectId, input.locationId);
  if (
    current.row.state !== "active" ||
    current.row.role !== "subject" ||
    current.row.currentRevisionId !== input.identityRevisionId
  ) {
    throw new LocalMonitorConflictError();
  }
  await tx.$queryRaw`SELECT id FROM keywords WHERE "projectId"=${projectId} AND "publicId" = ANY(${input.keywordIds}::text[]) ORDER BY id FOR SHARE`;
  const rows = await tx.keyword.findMany({
    where: { projectId, publicId: { in: input.keywordIds }, archivedAt: null },
    select: { ...localKeywordSelect, publicId: true },
  });
  if (rows.length !== input.keywordIds.length) throw new LocalMonitorConflictError();
  const keywords: MonitorKeyword[] = input.keywordIds.map((id) => {
    const keyword = rows.find((row) => row.publicId === id);
    if (
      !keyword ||
      (keyword.device !== "desktop" && keyword.device !== "mobile") ||
      keyword.device !== input.axes.device
    ) {
      throw new LocalMonitorConflictError();
    }
    return {
      id: keyword.id,
      publicId: keyword.publicId,
      text: keyword.text,
      device: keyword.device,
      locationId: keyword.locationId,
      measurementTargetEpoch: String(keyword.measurementTargetEpoch),
      measurementPolicyEpoch: String(keyword.measurementPolicyEpoch),
      sourceHash: localKeywordSourceHash({ ...keyword, device: keyword.device }),
    };
  });
  return { entityId: current.row.id, keywords };
}

export async function loadMonitorCalendar(
  tx: LocalTransaction,
  projectId: string,
  scheduleId: string,
): Promise<FrozenMonitorCalendar> {
  const schedule = await tx.checkSchedule.findFirst({ where: { projectId, publicId: scheduleId } });
  if (
    !schedule ||
    schedule.archivedAt ||
    !schedule.enabled ||
    !isScheduledFrequency(schedule.frequency)
  )
    throw new LocalMonitorConflictError();
  await tx.$queryRaw`SELECT id FROM check_schedules WHERE id=${schedule.id} AND "projectId"=${projectId} FOR SHARE`;
  const locked = await tx.checkSchedule.findFirst({ where: { projectId, id: schedule.id } });
  const defaults = await tx.projectDefaults.findUnique({
    where: { projectId },
    select: { timezone: true },
  });
  const timezone = locked?.timezone ?? defaults?.timezone;
  if (
    !locked ||
    locked.archivedAt ||
    !locked.enabled ||
    !isScheduledFrequency(locked.frequency) ||
    !timezone
  )
    throw new LocalMonitorConflictError();
  return {
    scheduleId: locked.id,
    publicId: locked.publicId,
    measurementEpoch: String(locked.measurementEpoch),
    frequency: locked.frequency,
    cronExpression: locked.cronExpression,
    timeOfDay: locked.timeOfDay,
    timezone,
    jitterMinutes: locked.jitterMinutes,
    serpDepth: locked.serpDepth,
    providerPolicy: locked.providerPolicy,
  };
}

/** Reusable inside the eventual admitted worker transaction; not a dispatch grant. */
export async function assertMonitorSourcesCurrent(
  tx: LocalTransaction,
  projectId: string,
  definition: import("./model").MonitorDefinition,
) {
  const current = await loadDefinitionReferences(tx, projectId, {
    name: definition.name,
    locationId: definition.locationId,
    identityRevisionId: definition.identityRevisionId,
    keywordIds: definition.keywords.map((row) => row.publicId),
    grid: {
      ...definition.grid.center,
      size: definition.grid.size,
      spacingMetres: definition.grid.spacingMetres,
    },
    axes: definition.axes,
  });
  if (
    current.entityId !== definition.entityId ||
    localDigest(current.keywords) !== localDigest(definition.keywords)
  )
    throw new LocalMonitorConflictError();
}
