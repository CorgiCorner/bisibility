import { createPointRevision } from "@/lib/local-monitoring/geometry";
import type { PointRevision } from "@/lib/local-monitoring/types";
import { z } from "zod";
import { localToken } from "./schema";

const pointSchema = z
  .object({
    version: z.literal(1),
    revisionId: localToken,
    revisionKey: localToken,
    contentHash: localToken,
    coordinate: z.object({ latitude: localToken, longitude: localToken }).strict(),
    precision: z.literal(7),
    geometryModel: z.literal("sphere-r6371000-v1"),
  })
  .strict();
export function retainedLocalPoint(value: unknown): PointRevision {
  const point = pointSchema.parse(value);
  const canonical = createPointRevision({ revisionId: point.revisionId, ...point.coordinate });
  if (
    point.revisionKey !== canonical.revisionKey ||
    point.contentHash !== canonical.contentHash ||
    point.coordinate.latitude !== canonical.coordinate.latitude ||
    point.coordinate.longitude !== canonical.coordinate.longitude
  )
    throw new Error("Retained immutable point proof changed.");
  return canonical;
}
