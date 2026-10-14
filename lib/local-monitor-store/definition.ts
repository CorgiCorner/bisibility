import { createGridRevision } from "@/lib/local-monitoring/geometry";
import {
  freezeLocalInput,
  localDigest,
  localKeywordRevision,
} from "@/lib/local-monitoring-store/canonical";
import type { MonitorDefinition, MonitorKeyword } from "./model";
import { LocalMonitorDefinitionInputError } from "./model";
import type { MonitorDefinitionInput } from "./schema";
import { definitionInputSchema } from "./schema";

export function buildMonitorDefinition(
  input: MonitorDefinitionInput,
  reference: {
    entityId: string;
    keywords: readonly MonitorKeyword[];
    revisionId: string;
  },
): MonitorDefinition {
  const value = definitionInputSchema.parse(input);
  if (
    reference.keywords.length !== value.keywordIds.length ||
    reference.keywords.some(
      (keyword, index) =>
        keyword.publicId !== value.keywordIds[index] || keyword.device !== value.axes.device,
    )
  ) {
    throw new Error(
      "Every ordered keyword must be an active same-project target with the selected device.",
    );
  }
  for (const keyword of reference.keywords) localKeywordRevision(keyword);
  let grid: MonitorDefinition["grid"];
  try {
    grid = createGridRevision({
      revisionId: reference.revisionId,
      center: {
        latitude: value.grid.latitude,
        longitude: value.grid.longitude,
      },
      size: value.grid.size,
      spacingMetres: value.grid.spacingMetres,
    });
  } catch (error) {
    throw new LocalMonitorDefinitionInputError(error);
  }
  return freezeLocalInput({
    version: 1 as const,
    name: value.name,
    locationId: value.locationId,
    entityId: reference.entityId,
    identityRevisionId: value.identityRevisionId,
    grid,
    axes: value.axes,
    keywords: structuredClone(reference.keywords),
  });
}

/** Recompute through the one existing geometry implementation, never infer a grid from results. */
export function assertMonitorDefinition(input: MonitorDefinition): MonitorDefinition {
  const rebuilt = buildMonitorDefinition(
    {
      name: input.name,
      locationId: input.locationId,
      identityRevisionId: input.identityRevisionId,
      keywordIds: input.keywords.map(({ publicId }) => publicId),
      grid: {
        ...input.grid.center,
        size: input.grid.size as 1 | 3 | 5 | 7,
        spacingMetres: input.grid.spacingMetres,
      },
      axes: input.axes,
    },
    { entityId: input.entityId, keywords: input.keywords, revisionId: input.grid.revisionId },
  );
  if (localDigest(input) !== localDigest(rebuilt))
    throw new Error("Stored monitor definition or ordered geometry changed.");
  return rebuilt;
}
