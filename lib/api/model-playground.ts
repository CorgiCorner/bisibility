import "server-only";
import { authorize } from "@/lib/auth/authorize";
import type { z } from "zod";
import { type ApiContext, projectScopes, requireApiActor } from "./context";
import { ApiInputError } from "./errors";
import { IDEMPOTENCY_BODY_BYTES } from "./idempotency";
import { consumeModelPlaygroundEstimateLimit } from "./model-playground-estimate-limit";
import {
  modelPlaygroundAdmissionSchema,
  modelPlaygroundCatalogInputSchema,
  modelPlaygroundCatalogSchema,
  modelPlaygroundCreateSchema,
  modelPlaygroundEstimateSchema,
  modelPlaygroundPreviewInputSchema,
  modelPlaygroundPreviewSchema,
  modelPlaygroundRunIdSchema,
  modelPlaygroundRunSchema,
  projectModelPlaygroundRun,
  withDemotedRead,
} from "./model-playground-schemas";
import {
  getModelPlaygroundService,
  type ModelPlaygroundScope,
  type ModelPlaygroundService,
  type ModelPlaygroundServiceFailure,
} from "./model-playground-service";
import { hasScope } from "./request-scope";
import { dataResponse, errorResponse } from "./responses";
import { camelizeKeys, readJsonBody, scopedProject, snakeizeKeys } from "./surface";

const failures = {
  not_available_yet: ["provider_unavailable", 503, "Model Playground is not available yet."],
  not_found: ["not_found", 404, "Model Playground resource not found."],
  forbidden: ["forbidden", 403, "Model Playground access denied."],
  validation_failed: ["validation_failed", 400, "Model Playground configuration is invalid."],
} as const;
function failure(ctx: ApiContext, result: unknown): Response | undefined {
  if (
    !result ||
    typeof result !== "object" ||
    !("kind" in result) ||
    typeof result.kind !== "string" ||
    !Object.hasOwn(failures, result.kind)
  )
    return;
  const kind = result.kind as ModelPlaygroundServiceFailure["kind"];
  const [code, status, detail] = failures[kind];
  return errorResponse(code, detail, status, {
    headers: ctx.headers,
    instance: ctx.instance,
    problemDetails: { reason: kind, ...(kind === "not_available_yet" ? { retryable: false } : {}) },
  });
}
function connectionResponse(ctx: ApiContext, result: unknown): Response | undefined {
  const refused = failure(ctx, result);
  if (refused) return refused;
  if (!result || typeof result !== "object" || !("kind" in result) || result.kind !== "ready")
    throw new Error("Model Playground connection response failed validation.");
}
function response<T>(ctx: ApiContext, schema: z.ZodType<T>, value: unknown, status = 200) {
  const refused = failure(ctx, value);
  if (refused) return refused;
  const parsed = schema.safeParse(value);
  // A broken service response can follow admission. It is never a client error or a safe retry.
  if (!parsed.success) throw new Error("Model Playground service response failed validation.");
  return dataResponse(snakeizeKeys(parsed.data), { headers: ctx.headers, status });
}

async function checkColumns(
  ctx: ApiContext,
  service: ModelPlaygroundService,
  scope: ModelPlaygroundScope,
  input: z.infer<typeof modelPlaygroundPreviewInputSchema>,
) {
  for (const column of input.columns) {
    const refused = connectionResponse(
      ctx,
      await service.checkConnection(scope, {
        providerId: column.providerId,
        connectionId: column.connectionId,
        ...(column.settings.workspaceId ? { workspaceId: column.settings.workspaceId } : {}),
      }),
    );
    if (refused) return refused;
  }
}

export async function modelPlaygroundRoute(ctx: ApiContext): Promise<Response | null> {
  const [, projectId, resource, collection, member] = ctx.path;
  if (resource !== "model-playground") return null;
  const scoped = scopedProject(ctx, projectId);
  if (scoped) return scoped;
  const actor = requireApiActor(ctx);
  const create = ctx.method === "POST" && collection === "runs" && !member;
  const catalog = ctx.method === "GET" && collection === "catalog" && ctx.path.length === 4;
  const preview =
    ctx.method === "POST" && collection === "runs" && member === "preview" && ctx.path.length === 5;
  // Estimate is read scope: it is computed in memory, is not binding and stores nothing.
  const estimate =
    ctx.method === "POST" &&
    collection === "runs" &&
    member === "estimate" &&
    ctx.path.length === 5;
  authorize(actor, create || preview ? "update" : "read", {
    type: "project",
    projectId: ctx.auth.project.id,
  });
  if ((create || preview) && !hasScope(projectScopes(ctx.auth), "write"))
    return failure(ctx, { kind: "forbidden" }) ?? null;
  const read = ctx.method === "GET" && collection === "runs" && member && ctx.path.length === 5;
  if (!catalog && !estimate && !preview && !(create && ctx.path.length === 4) && !read) return null;
  // Model Playground attributes every run to a programmatic credential; in-app sessions have none.
  if (ctx.origin.surface === "app") return failure(ctx, { kind: "forbidden" }) ?? null;
  const scope: ModelPlaygroundScope = {
    actor,
    projectId: ctx.auth.project.id,
    projectPublicId: projectId,
    entrySource: ctx.origin.source,
    credential: { id: ctx.origin.credentialId, kind: ctx.origin.credentialKind },
  };
  const service = getModelPlaygroundService();
  if (!service.enabled) return failure(ctx, { kind: "not_available_yet" }) ?? null;
  if (catalog) {
    const input = modelPlaygroundCatalogInputSchema.parse(
      camelizeKeys(Object.fromEntries(ctx.url.searchParams)),
    );
    const refused = connectionResponse(ctx, await service.checkConnection(scope, input));
    if (refused) return refused;
    return response(ctx, modelPlaygroundCatalogSchema, await service.catalog(scope, input));
  }
  if (estimate) {
    const limited = await consumeModelPlaygroundEstimateLimit({
      credentialKind: ctx.origin.credentialKind,
      credentialId: ctx.origin.credentialId,
      projectId: ctx.auth.project.id,
      headers: ctx.headers,
      instance: ctx.instance,
    });
    if (limited) return limited;
    const input = modelPlaygroundPreviewInputSchema.parse(
      camelizeKeys(await readJsonBody(ctx, { limit: IDEMPOTENCY_BODY_BYTES })),
    );
    const refused = await checkColumns(ctx, service, scope, input);
    if (refused) return refused;
    return response(ctx, modelPlaygroundEstimateSchema, await service.estimate(scope, input));
  }
  if (preview) {
    const input = modelPlaygroundPreviewInputSchema.parse(
      camelizeKeys(await readJsonBody(ctx, { limit: IDEMPOTENCY_BODY_BYTES })),
    );
    const refused = await checkColumns(ctx, service, scope, input);
    if (refused) return refused;
    return response(ctx, modelPlaygroundPreviewSchema, await service.preview(scope, input));
  }
  if (create && ctx.path.length === 4) {
    const key = ctx.req.headers.get("Idempotency-Key")?.trim();
    if (!key) throw new ApiInputError("Idempotency-Key is required.");
    if (key.length > 200) throw new ApiInputError("Idempotency-Key exceeds 200 characters.");
    const input = modelPlaygroundCreateSchema.parse(
      camelizeKeys(await readJsonBody(ctx, { limit: IDEMPOTENCY_BODY_BYTES })),
    );
    return response(ctx, modelPlaygroundAdmissionSchema, await service.create(scope, input, key));
  }
  if (read) {
    const runId = modelPlaygroundRunIdSchema.parse(member).toLowerCase();
    const value = await service.read(scope, runId);
    const refused = failure(ctx, value);
    if (refused) return refused;
    return withDemotedRead(() => {
      const projected = projectModelPlaygroundRun(value);
      const parsed = modelPlaygroundRunSchema.safeParse(projected);
      if (!parsed.success || parsed.data.projectId !== projectId || parsed.data.runId !== runId)
        throw new Error("Model Playground run response failed scope validation.");
      return response(ctx, modelPlaygroundRunSchema, parsed.data);
    });
  }
  return null;
}
