import "server-only";
import { createHash } from "node:crypto";
import type {
  SerpSnapshotContinuation,
  SnapshotExtensionState,
} from "@/lib/serp/snapshot-extension";
import { assertDefinitionActor } from "./access";
import { sameDefinitionBytes } from "./canonical";
import { DefinitionUnavailableError } from "./errors";
import type { DefinitionTransaction } from "./model";
import { bindingSchema } from "./storage";

export type SnapshotDefinitionBinding = Readonly<{
  id: string;
  actorId: string;
  projectId: string;
  keywordId: string;
  rankCheckId: string;
  connectionId: string;
  originalBindingId: string | null;
  originalObservedAt: string | null;
  originProof: "definition_binding" | "legacy_retained_context";
  requestDepth: 10;
  nextStart: number;
  leaseUntil: string;
  context: SerpSnapshotContinuation;
}>;
const captured = new WeakSet<object>();
export function assertCapturedSnapshotBinding(binding: SnapshotDefinitionBinding) {
  if (!captured.has(binding)) throw new DefinitionUnavailableError();
}
/** Composed inside the actual snapshot requestId/lease CAS transaction, never a current-head capture. */
export async function captureSnapshotDefinition(
  tx: DefinitionTransaction,
  input: {
    id: string;
    actorId: string;
    projectId: string;
    keywordId: string;
    rankCheckId: string;
    context: SerpSnapshotContinuation;
    state: SnapshotExtensionState;
  },
) {
  await assertDefinitionActor(tx, input.actorId, input.projectId, "update");
  if (!input.context.connectionId || !input.state.leaseUntil || input.state.requestId !== input.id)
    throw new DefinitionUnavailableError();
  const rows = await tx.$queryRaw<Array<{ original: unknown; observedAt: string | null }>>`
    SELECT CASE WHEN b.id IS NULL THEN NULL ELSE jsonb_build_object('id',b.id,'projectId',b."projectId",'keywordId',b."keywordId",
      'targetRevision',b."targetRevisionId",'policyRevision',b."policyRevisionId",'owner',b.owner,'request',b.request,'source',b.source,'capturedAt',b."capturedAt") END AS original,
      o."requestPolicy"->'evidence'->>'observedAt' AS "observedAt"
    FROM rank_checks c LEFT JOIN observation_runs o ON o."rankCheckId"=c.id AND o."projectId"=${input.projectId}
    LEFT JOIN measurement_execution_bindings b ON b.id=o."definitionBindingId" AND b."projectId"=o."projectId"
    WHERE c.id=${input.rankCheckId} AND c."keywordId"=${input.keywordId} AND c.status='completed' AND c.provider='serpapi'`;
  if (rows.length !== 1) throw new DefinitionUnavailableError();
  const original = rows[0].original;
  let originalBindingId: string | null = null;
  if (original) {
    // JSON timestamps are parsed explicitly; no Date is inferred from mutable Keyword state.
    const value = original as Record<string, unknown>;
    const binding = bindingSchema.parse({
      ...value,
      capturedAt: new Date(String(value.capturedAt)),
    });
    if (
      binding.request.providerId !== "serpapi" ||
      binding.keywordId !== input.keywordId ||
      binding.owner.rankCheckId !== input.rankCheckId ||
      binding.request.keyword !== input.context.keyword ||
      binding.request.domain !== input.context.domain ||
      binding.request.device !== input.context.device ||
      !sameDefinitionBytes(
        {
          gl: binding.request.location.gl,
          hl: binding.request.location.hl,
          primaryGeoCode: binding.request.location.primaryGeoCode,
          primaryGeoName: binding.request.location.primaryGeoName,
          secondaryGeoName: binding.request.location.secondaryGeoName,
        },
        input.context.location,
      )
    )
      throw new DefinitionUnavailableError();
    originalBindingId = binding.id;
  }
  const observed = rows[0].observedAt;
  const originalObservedAt = observed && Number.isFinite(Date.parse(observed)) ? observed : null;
  const binding: SnapshotDefinitionBinding = Object.freeze({
    id: input.id,
    actorId: input.actorId,
    projectId: input.projectId,
    keywordId: input.keywordId,
    rankCheckId: input.rankCheckId,
    connectionId: input.context.connectionId,
    originalBindingId,
    originalObservedAt,
    originProof: originalBindingId ? "definition_binding" : "legacy_retained_context",
    requestDepth: 10,
    nextStart: input.state.nextStart,
    leaseUntil: input.state.leaseUntil,
    context: structuredClone(input.context),
  });
  await tx.$executeRaw`INSERT INTO measurement_snapshot_request_bindings (id,"projectId","keywordId","rankCheckId","connectionId","originalBindingId",binding)
    VALUES (${binding.id},${binding.projectId},${binding.keywordId},${binding.rankCheckId},${binding.connectionId},${originalBindingId},${JSON.stringify(binding)}::jsonb)`;
  captured.add(binding);
  return binding;
}
export const snapshotNativeFingerprint = (value: { method: string; url: string }) =>
  createHash("sha256")
    .update(JSON.stringify([value.method, value.url]))
    .digest("hex");
