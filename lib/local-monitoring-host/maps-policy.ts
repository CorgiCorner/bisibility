import "server-only";
import { assertMonitorDefinition } from "@/lib/local-monitor-store/definition";
import type { MonitorDefinition } from "@/lib/local-monitor-store/model";
import { assertMonitorSourcesCurrent } from "@/lib/local-monitor-store/references";
import type { ExecutionTargetV1, PointRevision } from "@/lib/local-monitoring/types";
import {
  localDigest,
  localKeywordRevision,
  localKeywordSourceHash,
} from "@/lib/local-monitoring-store/canonical";
import type { LocalPolicyPort, LocalTransaction } from "@/lib/local-monitoring-store/context";
import type { LocalProviderBinding } from "@/lib/providers/local-search/contracts";

export async function assertMapsDefinition(
  tx: LocalTransaction,
  projectId: string,
  definition: MonitorDefinition,
) {
  assertMonitorDefinition(definition);
  const revision = await tx.localMonitorRevision.findFirst({
    where: { id: definition.grid.revisionId, projectId },
  });
  if (
    !revision ||
    revision.contentHash !== localDigest(definition) ||
    localDigest(revision.snapshot) !== revision.contentHash
  )
    throw new Error("Original Maps monitor revision changed.");
  const monitor = await tx.localMonitor.findFirst({
    where: { id: revision.monitorId, projectId, state: "active", currentRevisionId: revision.id },
  });
  if (!monitor) throw new Error("Maps monitor is archived or its revision changed.");
  await assertMonitorSourcesCurrent(tx, projectId, definition);
}
export function mapsBinding(
  projectId: string,
  definition: MonitorDefinition,
  target: ExecutionTargetV1,
  point: PointRevision,
): LocalProviderBinding {
  const keyword = definition.keywords.find((row) => row.id === target.keywordId);
  const original = definition.grid.points.find(
    (row) => row.point.revisionKey === point.revisionKey,
  )?.point;
  const {
    engine,
    surface,
    resultKind,
    rankScale,
    language,
    device,
    operatingSystem,
    cutoff,
    zoom,
  } = target;
  if (
    !keyword ||
    !original ||
    localDigest(original) !== localDigest(point) ||
    target.projectId !== projectId ||
    target.policyRevision !== definition.grid.revisionId ||
    target.keywordRevision !== localKeywordRevision(keyword) ||
    localDigest({
      engine,
      surface,
      resultKind,
      rankScale,
      language,
      device,
      operatingSystem,
      cutoff,
      zoom,
    }) !== localDigest(definition.axes)
  )
    throw new Error("Maps target is outside its immutable monitor definition.");
  return {
    target,
    point,
    keyword: { id: keyword.id, revision: localKeywordRevision(keyword), text: keyword.text },
    requestedAt: null,
  };
}
export function mapsPolicy(projectId: string, definition: MonitorDefinition): LocalPolicyPort {
  return {
    async capture(tx, input) {
      if (input.projectId !== projectId) throw new Error("Maps project changed.");
      await assertMapsDefinition(tx, projectId, definition);
      const keyword = definition.keywords.find((row) => row.id === input.keyword.id);
      if (
        !keyword ||
        localKeywordRevision(keyword) !== localKeywordRevision(input.keyword) ||
        keyword.sourceHash !== localKeywordSourceHash(input.keyword) ||
        localDigest(input.options) !== localDigest(definition.axes)
      )
        throw new Error("Maps keyword/options changed.");
      return {
        keywordRevision: localKeywordRevision(keyword),
        policyRevision: definition.grid.revisionId,
      };
    },
    async assertCurrent(tx, input) {
      if (input.projectId !== projectId) throw new Error("Maps project changed.");
      await assertMapsDefinition(tx, projectId, definition);
      const point = definition.grid.points.find(
        (row) => row.point.revisionKey === input.target.pointRevision,
      )?.point;
      if (!point) throw new Error("Maps point is outside the monitor.");
      mapsBinding(projectId, definition, input.target, point);
      const keyword = definition.keywords.find((row) => row.id === input.keyword.id);
      if (
        !keyword ||
        localKeywordRevision(keyword) !== localKeywordRevision(input.keyword) ||
        keyword.sourceHash !== localKeywordSourceHash(input.keyword)
      )
        throw new Error("Maps keyword changed.");
    },
  };
}
