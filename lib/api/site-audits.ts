import "server-only";

import { requireProjectScope } from "@/lib/actions/_shared";
import { assertProjectWritable } from "@/lib/deployment/project-write-mode";
import { isOperationAccessDeniedError } from "@/lib/operations/access-error";
import { AuditRateLimitError } from "@/lib/site-audit/errors";
import {
  cancelSiteAuditRun,
  listSiteAuditRunPages,
  readSiteAuditRun,
  resumeSiteAuditRun,
} from "@/lib/site-audit/runs";
import {
  siteAuditPagesQuery,
  siteAuditSchema,
  siteAuditWorkerSchema,
} from "@/lib/site-audit/schema";
import { listSiteAudits, readSiteAudit, runSiteAudit } from "@/lib/site-audit/service";
import { siteAuditWorkerEnabled } from "@/lib/site-audit/worker-config";
import { type ApiContext, notFound, requireApiActor } from "./context";
import { errorFromUnknown } from "./error-mapper";
import { dataResponse, errorResponse } from "./responses";
import { parseApiInput, readJsonBody, runDomain, scopedProject, snakeizeKeys } from "./surface";

export async function runSiteAuditRoute(ctx: ApiContext, projectId: string) {
  const denial = scopedProject(ctx, projectId);
  if (denial) return denial;
  const input = parseApiInput(
    (await siteAuditWorkerEnabled()) ? siteAuditWorkerSchema : siteAuditSchema,
    await readJsonBody(ctx),
  );
  return runDomain(async () => {
    const actor = requireApiActor(ctx);
    const project = await requireProjectScope(actor, "create", projectId, { type: "project" });
    try {
      return dataResponse(
        snakeizeKeys(await runSiteAudit({ actor, actorId: ctx.actorId, project }, input)),
        { headers: ctx.headers },
      );
    } catch (error) {
      if (isOperationAccessDeniedError(error)) return errorFromUnknown(error, ctx.headers, ctx.url);
      if (!(error instanceof AuditRateLimitError)) throw error;
      const headers = new Headers(ctx.headers);
      const retryAfter = error.retryAfterSeconds;
      headers.set("Retry-After", String(retryAfter));
      headers.set("RateLimit-Limit", String(error.limit));
      headers.set("RateLimit-Remaining", String(error.remaining));
      headers.set("RateLimit-Reset", String(retryAfter));
      return errorResponse("rate_limited", error.message, 429, {
        headers,
        instance: ctx.instance,
        problemDetails: { reset_at: error.resetAt, retry_after_seconds: retryAfter },
      });
    }
  });
}
export async function listSiteAuditsRoute(ctx: ApiContext, projectId: string) {
  const denial = scopedProject(ctx, projectId);
  if (denial) return denial;
  return dataResponse(snakeizeKeys(await listSiteAudits(ctx.auth.project.id)), {
    headers: ctx.headers,
  });
}
export async function getSiteAuditRoute(ctx: ApiContext, projectId: string, reportId: string) {
  const denial = scopedProject(ctx, projectId);
  if (denial) return denial;
  const report = await readSiteAudit(ctx.auth.project.id, reportId);
  return report
    ? dataResponse(snakeizeKeys(report), { headers: ctx.headers })
    : notFound(ctx, "Site audit report not found.");
}

async function runDetailRoute(
  ctx: ApiContext,
  projectId: string,
  reportId: string,
  action: string,
) {
  const denial = scopedProject(ctx, projectId);
  if (denial) return denial;
  return runDomain(async () => {
    const actor = requireApiActor(ctx);
    const mutation = action === "cancel" || action === "resume";
    const project = await requireProjectScope(actor, mutation ? "create" : "read", projectId, {
      type: "project",
    });
    if (action === "resume") assertProjectWritable(project);
    const controlActor = {
      actorId: ctx.actorId ?? null,
      credentialId: ctx.origin.credentialId,
      credentialKind: ctx.origin.credentialKind,
    };
    let result:
      | Awaited<ReturnType<typeof readSiteAuditRun>>
      | Awaited<ReturnType<typeof listSiteAuditRunPages>>;
    if (action === "run") result = await readSiteAuditRun(project.id, reportId);
    else if (action === "pages") {
      const query = parseApiInput(siteAuditPagesQuery, Object.fromEntries(ctx.url.searchParams));
      result = await listSiteAuditRunPages(project.id, reportId, query.offset, query.limit);
    } else if (action === "cancel")
      result = await cancelSiteAuditRun(project.id, reportId, controlActor);
    else result = await resumeSiteAuditRun(project.id, reportId, controlActor);
    return result
      ? dataResponse(snakeizeKeys(result), { headers: ctx.headers })
      : notFound(ctx, "Site audit run not found.");
  });
}
export function siteAuditsRoute(ctx: ApiContext) {
  const [first, projectId, resource, reportId, action] = ctx.path;
  if (first !== "projects" || !projectId || resource !== "site-audits") return null;
  if (ctx.path.length === 3 && ctx.method === "POST") return runSiteAuditRoute(ctx, projectId);
  if (ctx.path.length === 3 && ctx.method === "GET") return listSiteAuditsRoute(ctx, projectId);
  if (ctx.path.length === 4 && reportId && ctx.method === "GET")
    return getSiteAuditRoute(ctx, projectId, reportId);
  if (
    ctx.path.length === 5 &&
    reportId &&
    action &&
    ((ctx.method === "GET" && ["run", "pages"].includes(action)) ||
      (ctx.method === "POST" && ["cancel", "resume"].includes(action)))
  )
    return runDetailRoute(ctx, projectId, reportId, action);
  return null;
}
