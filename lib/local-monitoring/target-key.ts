import { hasAsciiControlCharacters } from "@/lib/validation/control-characters";
import { z } from "zod";
import { contentKey } from "./key";
import type { ExecutionTargetV1, OperationScope, ProjectionV1 } from "./types";

const token = z
  .string()
  .min(1)
  .max(512)
  .refine((value) => value.trim() === value && !hasAsciiControlCharacters(value));
export const executionTargetSchema = z
  .object({
    version: z.literal(1),
    projectId: token,
    keywordId: token,
    keywordRevision: token,
    pointRevision: token,
    engine: z.literal("google"),
    surface: z.enum(["web_serp", "maps", "local_finder"]),
    resultKind: z.enum(["local_pack", "map_listing", "listing"]),
    rankScale: z.enum(["pack_slot", "maps_organic", "finder_organic"]),
    language: token,
    device: z.enum(["desktop", "mobile"]),
    operatingSystem: token.nullable(),
    cutoff: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    zoom: z.number().finite().min(0).max(23).nullable(),
    policyRevision: token,
  })
  .strict()
  .superRefine((target, ctx) => {
    const valid =
      target.surface === "web_serp"
        ? target.resultKind === "local_pack" &&
          target.rankScale === "pack_slot" &&
          target.zoom === null
        : target.surface === "maps"
          ? target.resultKind === "map_listing" && target.rankScale === "maps_organic"
          : target.resultKind === "listing" && target.rankScale === "finder_organic";
    if (!valid)
      ctx.addIssue({ code: "custom", message: "Surface, kind and rank scale do not match" });
  });

export function executionTargetKey(input: ExecutionTargetV1) {
  const target = executionTargetSchema.parse(input);
  return contentKey("local-target-v1", [
    target.projectId,
    target.keywordId,
    target.keywordRevision,
    target.pointRevision,
    target.engine,
    target.surface,
    target.resultKind,
    target.rankScale,
    target.language,
    target.device,
    target.operatingSystem,
    target.cutoff,
    target.zoom,
    target.policyRevision,
  ]);
}

export const projectionSchema = z
  .object({
    version: z.literal(1),
    executionTargetKey: token,
    entityRevision: token,
    matcherVersion: token,
    normalizationVersion: token,
  })
  .strict();
export function projectionKey(input: ProjectionV1) {
  const projection = projectionSchema.parse(input);
  return contentKey("local-projection-v1", [
    projection.executionTargetKey,
    projection.entityRevision,
    projection.matcherVersion,
    projection.normalizationVersion,
  ]);
}

export const operationScopeSchema = z
  .object({ projectId: token, operation: z.literal("local_scan_submit"), idempotencyKey: token })
  .strict();
export function operationKey(input: OperationScope) {
  const scope = operationScopeSchema.parse(input);
  return contentKey("local-operation-v1", [scope.projectId, scope.operation, scope.idempotencyKey]);
}
