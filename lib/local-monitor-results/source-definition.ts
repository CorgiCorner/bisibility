import { isPublicIdOfType } from "@/lib/db/public-id-resources";
import { buildMonitorDefinition } from "@/lib/local-monitor-store/definition";
import { definitionInputSchema } from "@/lib/local-monitor-store/definition-schema";
import { createGridRevision } from "@/lib/local-monitoring/geometry";
import { localDigest } from "@/lib/local-monitoring-store/canonical";
import { localToken } from "@/lib/local-monitoring-store/target-input-schema";
import { z } from "zod";

const keywordSchema = z
  .object({
    id: localToken,
    publicId: z.string().refine((id) => isPublicIdOfType(id, "kw")),
    text: z.string().min(1).max(1000),
    device: z.enum(["desktop", "mobile"]),
    locationId: localToken,
    measurementTargetEpoch: z.string().regex(/^(0|[1-9]\d*)$/),
    measurementPolicyEpoch: z.string().regex(/^(0|[1-9]\d*)$/),
    sourceHash: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
const gridHeaderSchema = z
  .object({
    revisionId: localToken,
    center: z.object({ latitude: z.string(), longitude: z.string() }).strict(),
    size: z.union([z.literal(1), z.literal(3), z.literal(5), z.literal(7)]),
    spacingMetres: z.number().finite().nonnegative(),
  })
  .passthrough();
const sourceSchema = z
  .object({
    version: z.literal(1),
    name: definitionInputSchema.shape.name,
    locationId: definitionInputSchema.shape.locationId,
    identityRevisionId: definitionInputSchema.shape.identityRevisionId,
    entityId: localToken,
    axes: definitionInputSchema.shape.axes,
    keywords: z.array(keywordSchema).min(1).max(100),
    grid: z.unknown(),
  })
  .strict();
/** Parse before reconstruction; request JSON cannot fabricate typed internal revisions. */
export function readRetainedMonitorDefinition(input: unknown) {
  const source = sourceSchema.parse(input),
    header = gridHeaderSchema.parse(source.grid);
  const grid = createGridRevision({
    revisionId: header.revisionId,
    center: header.center,
    size: header.size,
    spacingMetres: header.spacingMetres,
  });
  if (localDigest(grid) !== localDigest(source.grid)) throw new Error("Retained grid changed");
  const definition = buildMonitorDefinition(
    {
      name: source.name,
      locationId: source.locationId,
      identityRevisionId: source.identityRevisionId,
      axes: source.axes,
      keywordIds: source.keywords.map((keyword) => keyword.publicId),
      grid: { ...grid.center, size: grid.size, spacingMetres: grid.spacingMetres },
    },
    { entityId: source.entityId, keywords: source.keywords, revisionId: grid.revisionId },
  );
  if (localDigest(input) !== localDigest(definition))
    throw new Error("Retained monitor definition changed");
  return definition;
}
