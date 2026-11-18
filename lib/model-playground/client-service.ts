"use client";
import type { ModelPlaygroundCatalogLoader } from "./catalog-request";
import type { ModelPlaygroundLaunchService } from "./launch-service";

export function createServerModelPlaygroundService(
  projectId: string,
): ModelPlaygroundLaunchService {
  return {
    async preview(request, signal) {
      signal.throwIfAborted();
      const { previewModelPlaygroundAction } = await import("@/lib/actions/model-playground");
      const outcome = await previewModelPlaygroundAction(projectId, request);
      signal.throwIfAborted();
      if (outcome.kind !== "preview") throw new Error(outcome.message);
      return outcome.quote;
    },
    async launch(request) {
      const { launchModelPlaygroundAction } = await import("@/lib/actions/model-playground");
      const outcome = await launchModelPlaygroundAction(projectId, request);
      if (outcome.kind !== "admitted") throw outcome;
      return outcome.result;
    },
    async read(runId) {
      const { readModelPlaygroundAction } = await import("@/lib/actions/model-playground");
      return readModelPlaygroundAction(projectId, runId);
    },
  };
}

export function serverModelCatalogLoader(projectId: string): ModelPlaygroundCatalogLoader {
  return async (request, signal) => {
    signal.throwIfAborted();
    const { getModelPlaygroundCatalogAction } = await import("@/lib/actions/model-playground");
    const result = await getModelPlaygroundCatalogAction(projectId, request);
    signal.throwIfAborted();
    if (result.kind !== "catalog") throw new Error(result.message);
    return result.catalog;
  };
}
