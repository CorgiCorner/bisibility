import "server-only";
import { createAgentReport, getAgentReport, listAgentReports } from "@/lib/agent-reports/service";
import { consume } from "@/lib/api/ratelimit";
import { type Actor, authorize } from "@/lib/auth/authorize";
import { prisma } from "@/lib/db/prisma";
import { assertProjectWritable } from "@/lib/deployment/project-write-mode";
import { requireTrackedDomain } from "@/lib/projects/tracked-domain";
import { SchedulerDisabledError, schedulerDriver } from "@/lib/scheduler/driver";
import { assertSiteAuditOperationAccess } from "./budget-extension";
import { crawlSite } from "./crawl";
import { AuditRateLimitError } from "./errors";
import { createSiteAuditRun, readSiteAuditRunReport } from "./runs";
import {
  type SavedSiteAudit,
  siteAuditResultSchema,
  siteAuditSchema,
  siteAuditWorkerSchema,
} from "./schema";
import { auditTarget } from "./target";
import { siteAuditInlineFallbackEnabled, siteAuditWorkerEnabled } from "./worker-config";

export const SITE_AUDIT_KIND = "site_audit";
type AuditProject = { id: string; domain: string | null; writeMode?: unknown };
export async function runSiteAudit(
  context: { actor: Actor; actorId?: string | null; project: AuditProject },
  input: unknown,
): Promise<SavedSiteAudit> {
  const { maxPages } = siteAuditWorkerSchema.parse(input);
  const { project } = context;
  authorize(context.actor, "create", { projectId: project.id, type: "project" });
  assertProjectWritable(project);
  let workerEnabled = await siteAuditWorkerEnabled();
  if (workerEnabled && schedulerDriver() === "none") {
    if (!(await siteAuditInlineFallbackEnabled())) throw new SchedulerDisabledError();
    workerEnabled = false;
  }
  if (!workerEnabled) siteAuditSchema.parse(input);
  const domain = requireTrackedDomain(project);
  const target = auditTarget(domain);
  const policy = await prisma.project.findUniqueOrThrow({
    where: { id: project.id },
    select: { lookupCacheTtlSeconds: true },
  });
  const ttl = policy.lookupCacheTtlSeconds ?? 300;
  const recentRows = await prisma.agentReport.findMany({
    where: {
      projectId: project.id,
      kind: SITE_AUDIT_KIND,
      OR: [
        {
          cacheReuseUntil: { gt: new Date() },
          createdAt: { gt: new Date(Date.now() - ttl * 1000) },
        },
        {
          cacheReuseUntil: null,
          createdAt: { gt: new Date(Date.now() - Math.min(ttl, 300) * 1000) },
        },
      ],
    },
    select: { publicId: true, createdAt: true },
    orderBy: { createdAt: "desc" },
    take: 1,
  });
  const recent = recentRows.map((row) => ({
    id: row.publicId,
    createdAt: row.createdAt.toISOString(),
  }));
  if (recent[0]) {
    const saved = await getAgentReport({ projectId: project.id, reportId: recent[0].id });
    const parsed = siteAuditResultSchema.safeParse(saved?.body);
    const result = parsed.success ? parsed.data : undefined;
    if (
      result?.version === 1 &&
      result.limits.maxPages === maxPages &&
      result.target === target.href
    ) {
      const live =
        saved?.provenance?.source === "bounded_http_crawl_worker"
          ? await readSiteAuditRunReport(project.id, recent[0].id)
          : null;
      return {
        id: recent[0].id,
        createdAt: recent[0].createdAt,
        cached: true,
        result: live?.result ?? result,
        ...(live ? { run: live.run } : {}),
      };
    }
  }
  await assertSiteAuditOperationAccess(project.id);
  const allowed = await consume({
    prefix: "bisibility:site-audit",
    bucketKey: project.id,
    limit: 2,
    windowSeconds: 60,
  });
  if (!allowed.success)
    throw new AuditRateLimitError(allowed.resetAt, allowed.limit, allowed.remaining);
  if (workerEnabled)
    return createSiteAuditRun({
      projectId: project.id,
      actorId: context.actorId ?? context.actor.id,
      domain,
      target: target.href,
      requestedPages: maxPages,
    });
  const result = await crawlSite(domain, maxPages);
  const report = await createAgentReport({
    projectId: project.id,
    actorId: context.actorId ?? context.actor.id,
    kind: SITE_AUDIT_KIND,
    cacheReuseUntil: new Date(Date.now() + ttl * 1000),
    title: `Site audit: ${domain}`,
    body: result,
    provenance: { source: "bounded_http_crawl", limits: result.limits, providerCostCents: 0 },
  });
  return { id: report.id, createdAt: report.createdAt, cached: false, result };
}
export async function readSiteAudit(projectId: string, reportId: string) {
  const report = await getAgentReport({ projectId, reportId });
  if (!report || report.kind !== SITE_AUDIT_KIND) return null;
  const result = siteAuditResultSchema.safeParse(report.body);
  if (!result.success) return null;
  const live =
    report.provenance?.source === "bounded_http_crawl_worker"
      ? await readSiteAuditRunReport(projectId, reportId)
      : null;
  return {
    id: report.id,
    createdAt: report.createdAt,
    cached: true,
    result: live?.result ?? result.data,
    ...(live ? { run: live.run } : {}),
  };
}
export async function listSiteAudits(projectId: string) {
  return listAgentReports({ projectId, kind: SITE_AUDIT_KIND, limit: 30 });
}
