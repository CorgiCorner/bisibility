import "server-only";

import { requireProjectScope } from "@/lib/actions/_shared";
import { AuditRateLimitError } from "@/lib/site-audit/errors";
import { siteAuditSchema } from "@/lib/site-audit/schema";
import { listSiteAudits, readSiteAudit, runSiteAudit } from "@/lib/site-audit/service";
import { type ApiContext, notFound, requireApiActor } from "./context";
import { dataResponse, errorResponse } from "./responses";
import { parseApiInput, readJsonBody, runDomain, scopedProject, snakeizeKeys } from "./surface";

export async function runSiteAuditRoute(ctx: ApiContext, projectId: string) {
  const denial = scopedProject(ctx, projectId);
  if (denial) return denial;
  const input = parseApiInput(siteAuditSchema, await readJsonBody(ctx));
  return runDomain(async () => {
    const actor = requireApiActor(ctx);
    const project = await requireProjectScope(actor, "create", projectId, { type: "project" });
    try {
      return dataResponse(
        snakeizeKeys(await runSiteAudit({ actor, actorId: ctx.actorId, project }, input)),
        { headers: ctx.headers },
      );
    } catch (error) {
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
export function siteAuditsRoute(ctx: ApiContext) {
  const [first, projectId, resource, reportId] = ctx.path;
  if (first !== "projects" || !projectId || resource !== "site-audits") return null;
  if (ctx.path.length === 3 && ctx.method === "POST") return runSiteAuditRoute(ctx, projectId);
  if (ctx.path.length === 3 && ctx.method === "GET") return listSiteAuditsRoute(ctx, projectId);
  if (ctx.path.length === 4 && reportId && ctx.method === "GET")
    return getSiteAuditRoute(ctx, projectId, reportId);
  return null;
}
