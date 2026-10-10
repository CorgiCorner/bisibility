import "server-only";
import { randomUUID } from "node:crypto";
import { collectTrackingDownload } from "@/lib/ai-tracking/exports/download";
import { trackingSampleProjection } from "@/lib/ai-tracking/projections/evidence";
import {
  publicTrackingPrompt,
  publicTrackingRevision,
  publicTrackingRun,
  publicTrackingSchedule,
  publicTrackingTopic,
} from "@/lib/ai-tracking/projections/public";
import { listPrompts } from "@/lib/ai-tracking/stores/prompts";
import { listTopics } from "@/lib/ai-tracking/stores/topics";
import { projectContextSuggestions } from "@/lib/ai-tracking/suggestions/project";
import type {
  AiPrompt,
  AiPromptRevision,
  AiTopic,
  AiTrackingSchedule,
} from "@/lib/generated/prisma/client";
import { z } from "zod";
import { trackingAcceptedDrafts } from "./ai-tracking-acceptance";
import {
  auditTrackingAcceptance,
  auditTrackingCatalog,
  auditTrackingRun,
} from "./ai-tracking-audit";
import {
  trackingCamelizeKeys as camelizeKeys,
  trackingSnakeizeKeys as snakeizeKeys,
} from "./ai-tracking-keys";
import { aiTrackingOperationPolicy } from "./ai-tracking-policy";
import {
  mutateTrackingCatalog,
  trackingCatalog,
  trackingLaunch,
  trackingRevisions,
  trackingRun,
  trackingRunOperation,
  trackingRuns,
  trackingSamples,
  trackingScope,
} from "./ai-tracking-service";
import { handleAiTrackingSuggestionGeneration } from "./ai-tracking-suggestions";
import { trackingTrends } from "./ai-tracking-trends";
import type { ApiContext } from "./context";
import { requireApiActor } from "./context";
import { paginateArray } from "./pagination";
import { dataResponse, errorResponse, listResponse } from "./responses";
import { domainError, readJsonBody, scopedProject } from "./surface";

export async function aiTrackingRoute(ctx: ApiContext): Promise<Response | null> {
  const policy = aiTrackingOperationPolicy(ctx.method, ctx.path);
  if (!policy) return null;
  const projectPublicId = ctx.path[1];
  const scoped = scopedProject(ctx, projectPublicId);
  if (scoped) return scoped;
  try {
    return await (async () => {
      const actor = requireApiActor(ctx);
      const project = await trackingScope(actor, projectPublicId, policy.scope === "write");
      if (!ctx.auth.apiKey.scopes.includes(policy.scope))
        return errorResponse("forbidden", `The ${policy.scope} scope is required.`, 403, {
          headers: ctx.headers,
        });
      const resource = ctx.path[3];
      const member = ctx.path[4];
      const action = ctx.path[5];
      const page = Object.fromEntries(ctx.url.searchParams);
      const body =
        ctx.method === "GET" || ctx.method === "DELETE"
          ? {}
          : camelizeKeys(await readJsonBody(ctx));
      const response = (data: unknown, status = 200) =>
        dataResponse(snakeizeKeys(data), { headers: ctx.headers, status });
      const publicCatalog = async (row: unknown) =>
        resource === "topics"
          ? publicTrackingTopic(row as AiTopic)
          : resource === "prompts"
            ? publicTrackingPrompt(
                row as AiPrompt & { revisions: AiPromptRevision[] },
                await listTopics(project.id),
              )
            : publicTrackingSchedule(row as AiTrackingSchedule, await listPrompts(project.id));
      if (["topics", "prompts", "schedules"].includes(resource)) {
        if (ctx.method === "GET") {
          const items = await trackingCatalog(project.id, resource);
          const { page, nextCursor } = paginateArray(ctx.url, items, 50, 100);
          return listResponse(
            (await Promise.all(page.map(publicCatalog))).map(snakeizeKeys),
            nextCursor,
            { headers: ctx.headers },
          );
        }
        const result = await mutateTrackingCatalog(
          project.id,
          resource,
          ctx.method,
          resource === "schedules" && (body as { configuration?: unknown }).configuration
            ? {
                ...(body as object),
                configuration: {
                  ...(body as { configuration: object }).configuration,
                  idempotencyKey: `schedule-template-${randomUUID()}`,
                  actorId: actor.id,
                  actorCredential: {
                    id: ctx.origin.credentialId,
                    kind: ctx.origin.credentialKind,
                  },
                  entrySource: ctx.origin.source,
                  origin: "manual",
                },
              }
            : body,
          member,
        );
        await auditTrackingCatalog(
          actor,
          project,
          resource as "topics" | "prompts" | "schedules",
          ctx.method,
          body,
          result,
        );
        return response(await publicCatalog(result), ctx.method === "POST" ? 201 : 200);
      }
      if (resource === "runs" || resource === "history") {
        if (ctx.method === "POST" && member === "preview")
          return response(await trackingLaunch(project.id, body, true));
        if (ctx.method === "POST" && !member) {
          const key = ctx.req.headers.get("Idempotency-Key");
          if (!key)
            return errorResponse("bad_request", "Idempotency-Key is required.", 400, {
              headers: ctx.headers,
            });
          const result = await trackingLaunch(
            project.id,
            {
              ...(body as object),
              idempotencyKey: key,
              entrySource: ctx.origin.source,
              origin: "manual",
              actorId: actor.id,
              actorCredential: { id: ctx.origin.credentialId, kind: ctx.origin.credentialKind },
            },
            false,
          );
          await auditTrackingRun(actor, project, "launch", result);
          return response(publicTrackingRun(result), 201);
        }
        if (ctx.method === "POST" && action) {
          const result = await trackingRunOperation(project.id, member, action, {
            ...(body as object),
            idempotencyKey: ctx.req.headers.get("Idempotency-Key"),
            entrySource: ctx.origin.source,
            origin: "manual",
            actorId: actor.id,
            actorCredential: { id: ctx.origin.credentialId, kind: ctx.origin.credentialKind },
          });
          await auditTrackingRun(actor, project, action as "cancel" | "retry", result);
          return response(publicTrackingRun(result));
        }
        if (ctx.method === "GET" && action === "samples") {
          const result = await trackingSamples(project.id, member, page);
          return listResponse(
            result.items.map(trackingSampleProjection).map(snakeizeKeys),
            result.nextCursor,
            { headers: ctx.headers },
          );
        }
        if (member) return response(publicTrackingRun(await trackingRun(project.id, member)));
        const result = await trackingRuns(project.id, page);
        return listResponse(
          result.items.map(publicTrackingRun).map(snakeizeKeys),
          result.nextCursor,
          { headers: ctx.headers },
        );
      }
      if (resource === "export" || resource === "trends") {
        const runId = z.string().min(1).parse(page.run_id);
        if (resource === "trends")
          return response(await trackingTrends(project.id, runId, page.previous_run_id));
        const limit = z.coerce.number().int().min(1).max(100).default(50).parse(page.limit);
        const format = z.enum(["csv", "json"]).default("json").parse(page.format);
        const download = await collectTrackingDownload(
          runId,
          format,
          async (cursor) => {
            const result = await trackingSamples(project.id, runId, { limit, cursor });
            return {
              items: result.items.map(trackingSampleProjection),
              nextCursor: result.nextCursor,
            };
          },
          page.cursor,
          Math.floor(1000 / limit),
        );
        if (format === "json") return response(JSON.parse(download.content));
        const csv = download.content;
        const headers = new Headers(ctx.headers);
        headers.set("Content-Type", "text/csv; charset=utf-8");
        headers.set("Content-Disposition", 'attachment; filename="ai-tracking-evidence.csv"');
        if (download.nextCursor) headers.set("X-Next-Cursor", download.nextCursor);
        headers.set("X-Export-Complete", String(download.complete));
        return new Response(csv, { headers });
      }
      if (resource === "suggestions") {
        if (member === "preview" || member === "generate")
          return handleAiTrackingSuggestionGeneration(ctx, actor, project, member, body);
        if (!member) return response(await projectContextSuggestions(actor, project));
        const drafts = trackingAcceptedDrafts(body);
        const prompts = [];
        for (const draft of drafts)
          prompts.push(
            await mutateTrackingCatalog(project.id, "prompts", "POST", {
              text: draft.text,
              label: draft.category,
              category: draft.category,
              generationReference: draft.generationReference,
              providerDatasetReference: draft.providerDatasetReference,
            }),
          );
        await auditTrackingAcceptance(actor, project, prompts.length);
        const topics = await listTopics(project.id);
        return response(
          {
            prompts: prompts.map((prompt) =>
              publicTrackingPrompt(prompt as AiPrompt & { revisions: AiPromptRevision[] }, topics),
            ),
          },
          201,
        );
      }
      if (resource === "revisions")
        return response((await trackingRevisions(project.id, member)).map(publicTrackingRevision));
      return null;
    })();
  } catch (error) {
    if (error instanceof z.ZodError)
      return errorResponse("validation_failed", "Tracking input failed validation.", 422, {
        headers: ctx.headers,
        details: z.flattenError(error),
      });
    const message = error instanceof Error ? error.message : "Tracking request failed.";
    if (
      /bound to a different|preview changed|unresolved samples|reconciled terminal|known cost receipts/i.test(
        message,
      )
    )
      return errorResponse("conflict", message, 409, { headers: ctx.headers });
    if (
      /unsupported|requires|exceeds|unavailable|stale|consent|model|parameter|capability/i.test(
        message,
      )
    )
      return errorResponse("validation_failed", message, 422, { headers: ctx.headers });
    domainError(error);
  }
}
