"use server";

import { getActionActor, parseActionInput, requireProjectScope } from "@/lib/actions/_shared";
// biome-ignore format: compact imports keep this action module under the file line cap.
import { type ActionResult, actionFailureResult, destinationRejectionFailure } from "@/lib/actions/action-result";
import { resolveMigrationTargetActionResult } from "@/lib/actions/migration-target";
import { importChunkChecksum } from "@/lib/api/instance-import/session-schemas";
import { whereExecutedChecks } from "@/lib/checks/status";
import { prisma } from "@/lib/db/prisma";
import { parsePublicId, requirePublicId } from "@/lib/db/public-id";
// biome-ignore format: compact imports keep this action module under the file line cap.
import { countKeywordChunks, exportKeywordChunk, exportSectionsChunk } from "@/lib/migration/export-chunks";
// biome-ignore format: compact imports keep this action module under the file line cap.
import { assertPushMigrationKeywordLimit, CHUNK_MAX_HISTORY_ROWS, CHUNK_TARGET_KEYWORDS, shouldUseSessions } from "@/lib/migration/limits";
import { migrationFetch } from "@/lib/migration/transfer-client";
import { absoluteSiteUrl } from "@/lib/seo/jsonld";
import { z } from "zod";

const idSchema = z.string().min(1).max(160);
const strictPublicId = (prefix: "imp" | "kw" | "prj") =>
  idSchema.refine((value) => parsePublicId(value)?.prefix === prefix, {
    message: `Expected a strict ${prefix}_ v3 public ID.`,
  });
const jobIdSchema = strictPublicId("imp");
const keywordIdSchema = strictPublicId("kw");
const projectIdSchema = strictPublicId("prj");
const tokenSchema = z.string().min(20).max(256);
const targetOriginSchema = z
  .string()
  .trim()
  .max(2048)
  .optional()
  .transform((value) => value || undefined);
const projectSchema = z.object({ projectId: projectIdSchema });
const totalsSchema = z.object({
  keywords: z.number().int().nonnegative(),
  rankChecks: z.number().int().nonnegative(),
});
const createSessionSchema = z.object({
  chunkCount: z.number().int().positive(),
  projectId: projectIdSchema,
  targetOrigin: targetOriginSchema,
  token: tokenSchema,
  totals: totalsSchema,
});
const chunkSchema = z.object({
  cursor: keywordIdSchema.nullable().optional(),
  index: z.number().int().nonnegative(),
  projectId: projectIdSchema,
  sessionId: jobIdSchema,
  targetOrigin: targetOriginSchema,
  token: tokenSchema,
});
const finalizeSchema = z.object({
  projectId: projectIdSchema,
  sessionId: jobIdSchema,
  targetOrigin: targetOriginSchema,
  token: tokenSchema,
});
const chunkLimitsSchema = z.object({
  max_body_bytes: z.number().int().positive().optional(),
  max_history_rows: z.number().int().positive(),
  max_keywords: z.number().int().positive(),
});
const createSessionResponseSchema = z.object({
  chunk_limits: chunkLimitsSchema,
  session_id: jobIdSchema,
});
const chunkResponseSchema = z.object({
  chunks_received: z.number().int().nonnegative(),
});
const finalizeResponseSchema = z.object({
  counts: z.record(z.string(), z.number().int().nonnegative()).default({}),
  job_id: jobIdSchema,
  state: z.literal("done"),
});

type Actor = Awaited<ReturnType<typeof getActionActor>>;
type Payload = { kind: "keywords"; keywords: unknown[] } | { kind: "sections"; sections: unknown };
// biome-ignore format: compact session result types keep this action module under the file line cap.
type CreateSessionResult = ActionResult<{ chunkLimits: { maxBodyBytes: number | undefined; maxHistoryRows: number; maxKeywords: number }; sessionId: string }>;
// biome-ignore format: compact finalize result type keeps this action module under the file line cap.
type FinalizeResult = ActionResult<{ counts: Record<string, number>; jobId: string; state: "done" }>;

function responseDetail(body: unknown) {
  const record = body && typeof body === "object" && !Array.isArray(body) ? body : null;
  return record && "detail" in record && typeof record.detail === "string" ? record.detail : null;
}

async function responseJson(response: Response) {
  return (await response.json().catch(() => null)) as unknown;
}

// Shared destination-response handling: expected 4xx rejections become the same
// typed handled result single-shot uses; 5xx and malformed bodies keep throwing.
async function destinationResult<T>(
  response: Response,
  fallbackMessage: string,
  parse: (body: unknown) => T,
): Promise<ActionResult<T>> {
  const body = await responseJson(response);
  if (!response.ok) {
    const detail = responseDetail(body);
    const failure = destinationRejectionFailure(response.status, detail);
    if (failure) return actionFailureResult(failure);
    throw new Error(detail ?? fallbackMessage);
  }
  return { ok: true, value: parse(body) };
}

async function requireSourceProject(actor: Actor, projectId: string) {
  return requireProjectScope(
    actor,
    "manage",
    projectId,
    { type: "project" },
    { allowReadOnly: true },
  );
}

// biome-ignore format: compact transfer helpers keep this action module under the file line cap.
function authHeaders(token: string) { return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }; }
function checksum(payload: Payload) {
  return importChunkChecksum(payload);
}
function sessionUrl(path: string, origin: string) {
  return absoluteSiteUrl(path, origin);
}

async function putChunk(
  token: string,
  sessionId: string,
  index: number,
  payload: Payload,
  origin: string,
) {
  const response = await migrationFetch(
    sessionUrl(`/api/cloud/import/sessions/${sessionId}/chunks/${index}`, origin),
    {
      body: JSON.stringify({ checksum: checksum(payload), ...payload }),
      cache: "no-store",
      headers: authHeaders(token),
      method: "PUT",
      retries: 2,
      timeoutMs: 30_000,
    },
  );
  return destinationResult(response, "Cloud import chunk transfer failed.", (body) =>
    chunkResponseSchema.parse(body),
  );
}

export async function planChunkedTransfer(input: unknown) {
  const data = parseActionInput(projectSchema, input);
  const actor = await getActionActor();
  const project = await requireSourceProject(actor, data.projectId);
  const [totalKeywords, totalRankChecks] = await Promise.all([
    prisma.keyword.count({ where: { projectId: project.id } }),
    prisma.rankCheck.count({
      where: { keyword: { projectId: project.id }, ...whereExecutedChecks() },
    }),
  ]);
  assertPushMigrationKeywordLimit(totalKeywords);
  const keywordChunks = await countKeywordChunks({
    maxHistoryRows: CHUNK_MAX_HISTORY_ROWS,
    maxKeywords: CHUNK_TARGET_KEYWORDS,
    projectId: project.id,
  });

  return {
    chunkCount: keywordChunks + 1,
    totalKeywords,
    totalRankChecks,
    useSessions: shouldUseSessions({ keywords: totalKeywords, rankChecks: totalRankChecks }),
  };
}

export async function createRemoteImportSession(input: unknown): Promise<CreateSessionResult> {
  const data = parseActionInput(createSessionSchema, input);
  const actor = await getActionActor();
  const project = await requireSourceProject(actor, data.projectId);
  const target = resolveMigrationTargetActionResult(data.targetOrigin);
  if (!target.ok) return target;
  const origin = target.value;
  const response = await migrationFetch(sessionUrl("/api/cloud/import/sessions", origin), {
    body: JSON.stringify({
      chunk_count: data.chunkCount,
      source_project_id: requirePublicId(project.publicId, "prj"),
      totals: { keywords: data.totals.keywords, rank_checks: data.totals.rankChecks },
      version: 5,
    }),
    cache: "no-store",
    headers: authHeaders(data.token),
    method: "POST",
    timeoutMs: 30_000,
  });
  return destinationResult(response, "Cloud import session failed.", (body) => {
    const parsed = createSessionResponseSchema.parse(body);
    return {
      chunkLimits: {
        maxBodyBytes: parsed.chunk_limits.max_body_bytes,
        maxHistoryRows: parsed.chunk_limits.max_history_rows,
        maxKeywords: parsed.chunk_limits.max_keywords,
      },
      sessionId: parsed.session_id,
    };
  });
}

export async function exportAndTransferChunk(
  input: unknown,
): Promise<ActionResult<{ chunksReceived: number; done: boolean; nextCursor: string | null }>> {
  const data = parseActionInput(chunkSchema, input);
  const target = resolveMigrationTargetActionResult(data.targetOrigin);
  if (!target.ok) return target;
  const origin = target.value;
  const actor = await getActionActor();
  const project = await requireSourceProject(actor, data.projectId);
  const chunk = await exportKeywordChunk({
    cursor: data.cursor,
    maxHistoryRows: CHUNK_MAX_HISTORY_ROWS,
    maxKeywords: CHUNK_TARGET_KEYWORDS,
    projectId: project.id,
  });
  const result = await putChunk(
    data.token,
    data.sessionId,
    data.index,
    {
      kind: "keywords",
      keywords: chunk.keywords,
    },
    origin,
  );
  if (!result.ok) return result;
  return {
    ok: true as const,
    value: {
      chunksReceived: result.value.chunks_received,
      done: chunk.done,
      nextCursor: chunk.nextCursor,
    },
  };
}

export async function transferSectionsChunk(
  input: unknown,
): Promise<ActionResult<{ chunksReceived: number }>> {
  const data = parseActionInput(chunkSchema.omit({ cursor: true }), input);
  const target = resolveMigrationTargetActionResult(data.targetOrigin);
  if (!target.ok) return target;
  const origin = target.value;
  const actor = await getActionActor();
  const project = await requireSourceProject(actor, data.projectId);
  const sections = await exportSectionsChunk({ projectId: project.id, userId: actor.id });
  const result = await putChunk(
    data.token,
    data.sessionId,
    data.index,
    {
      kind: "sections",
      sections,
    },
    origin,
  );
  if (!result.ok) return result;
  return { ok: true as const, value: { chunksReceived: result.value.chunks_received } };
}

export async function finalizeRemoteImportSession(input: unknown): Promise<FinalizeResult> {
  const data = parseActionInput(finalizeSchema, input);
  const target = resolveMigrationTargetActionResult(data.targetOrigin);
  if (!target.ok) return target;
  const origin = target.value;
  const actor = await getActionActor();
  await requireSourceProject(actor, data.projectId);
  const response = await migrationFetch(
    sessionUrl(`/api/cloud/import/sessions/${data.sessionId}/finalize`, origin),
    {
      cache: "no-store",
      headers: authHeaders(data.token),
      method: "POST",
      timeoutMs: 120_000,
    },
  );
  return destinationResult(response, "Cloud import finalize failed.", (body) => {
    const parsed = finalizeResponseSchema.parse(body);
    return { counts: parsed.counts, jobId: parsed.job_id, state: parsed.state };
  });
}
