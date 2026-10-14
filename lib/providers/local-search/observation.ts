import {
  dataForSeoCapturedMetadata,
  providerObservationTime,
} from "@/lib/observation/provider-metadata";
import type { LocalObservationRunInput, LocalObservationScope } from "@/lib/observation/types";
import {
  LOCAL_ADAPTER_VERSION,
  LOCAL_CAPABILITY_VERSION,
  type LocalProviderBinding,
  type ParsedLocalPayload,
} from "./contracts";
import { parseLocalItems } from "./items";
import { object } from "./records";
import { localSurface, nativeTaskId, validateLocalBinding } from "./request";

export function parseLocalTaskResult(input: {
  data: unknown;
  taskId: string;
  binding: LocalProviderBinding;
  receivedAt: Date;
}): { payload: ParsedLocalPayload; observedAt: string | null } {
  validateLocalBinding(input.binding);
  if (!nativeTaskId(input.taskId) || !Number.isFinite(input.receivedAt.getTime()))
    throw new Error("Invalid local collection context");
  const root = object(input.data);
  const tasks = Array.isArray(root?.tasks) ? root.tasks : [];
  const task = object(tasks[0]);
  if (
    root?.status_code !== 20000 ||
    tasks.length !== 1 ||
    nativeTaskId(task?.id) !== input.taskId ||
    task?.status_code !== 20000 ||
    !Array.isArray(task.result) ||
    !task.result.length
  ) {
    throw new Error("Local result is unavailable or does not match the accepted task");
  }
  const surface = localSurface(input.binding);
  const { target, point } = input.binding;
  const scope: LocalObservationScope = {
    location: `${point.coordinate.latitude},${point.coordinate.longitude},${target.zoom}z`,
    language: target.language,
    device: target.device,
    pointRevisionId: point.revisionId,
    coordinates: { ...point.coordinate },
    zoom: target.zoom as number,
    scopeClass: "coordinate_seed",
  };
  const runs: LocalObservationRunInput[] = [];
  const identityIssues: ParsedLocalPayload["identityIssues"][number][] = [];
  let unsupportedItemCount = 0;
  for (const [resultOrdinal, value] of task.result.entries()) {
    const result = object(value);
    if (!result || result.type !== surface || !Array.isArray(result.items))
      throw new Error("Unsupported local result shape");
    const observedAt = providerObservationTime(result.datetime);
    const parsed = parseLocalItems({
      items: result.items,
      surface,
      taskId: input.taskId,
      resultOrdinal,
      observedAt,
    });
    identityIssues.push(...parsed.identityIssues);
    unsupportedItemCount += parsed.unsupportedItemCount;
    runs.push({
      provider: "dataforseo",
      surface,
      engine: "google",
      completeness: "unknown",
      configuredScope: { ...scope, coordinates: { ...scope.coordinates } },
      // Request echo/check_url is not evidence of the executed point/device.
      effectiveScope: null,
      executedAt: new Date(input.receivedAt.getTime()),
      items: parsed.items,
      requestPolicy: {
        version: 1,
        surface,
        depth: target.cutoff,
        cutoff: target.cutoff,
        zoom: target.zoom as number,
        capabilityVersion: LOCAL_CAPABILITY_VERSION,
        pointRevisionId: point.revisionId,
        policyRevision: target.policyRevision,
        evidence: {
          version: 1,
          adapterVersion: LOCAL_ADAPTER_VERSION,
          observedAt,
          observedThrough: observedAt,
          requestedAt:
            input.binding.requestedAt === null
              ? null
              : providerObservationTime(input.binding.requestedAt),
          targetRevision: target.keywordRevision,
          policyRevision: target.policyRevision,
          completeThrough: { [target.resultKind]: null },
        },
      },
    });
  }
  return {
    payload: {
      version: 1,
      provider: "dataforseo",
      adapterVersion: LOCAL_ADAPTER_VERSION,
      runs,
      identityIssues,
      unsupportedItemCount,
    },
    observedAt: dataForSeoCapturedMetadata(task.result).observedAt,
  };
}
