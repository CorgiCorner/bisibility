import "server-only";

import { agentReportSchema } from "@/lib/agent-reports/model";
import { writeAudit } from "@/lib/auth/audit";
import { prisma } from "@/lib/db/prisma";
import { makePublicId } from "@/lib/db/public-id-resources";
import type { Prisma } from "@/lib/generated/prisma/client";
import { SchedulerDisabledError, schedulerDriver } from "@/lib/scheduler/driver";
import {
  assertSiteAuditOperationAccess,
  lockSiteAuditAdmission,
  rememberSiteAuditBudget,
  resolveSiteAuditBudget,
} from "./budget-extension";
import { interruptSiteAuditRun, type SiteAuditControlActor } from "./interrupt";
import { auditPageEvidence } from "./page-evidence";
import { urlHash } from "./pages-store";
import type { CrawlStopReason } from "./run-contract";
import { pageSchema } from "./schema";
import { auditRunSummary } from "./summary";
import { siteAuditWorkerEnabled } from "./worker-config";

export async function createSiteAuditRun(input: {
  projectId: string;
  actorId: string | null;
  domain: string;
  target: string;
  requestedPages: number;
}) {
  return prisma.$transaction(async (tx) => {
    const budget = await resolveSiteAuditBudget(input, tx);
    if (!Number.isSafeInteger(budget.maxPages) || budget.maxPages < 0)
      throw new Error("Invalid site audit page budget.");
    const publicId = makePublicId("agr");
    const now = new Date();
    const exhausted = budget.maxPages === 0;
    const body = auditRunSummary({
      target: input.target,
      startedAt: now,
      completedAt: now,
      budgetPages: budget.maxPages,
      requests: 0,
      stopReason: exhausted ? budget.stopReason : "time_limit",
      pages: [],
    });
    const payload = agentReportSchema.parse({
      kind: "site_audit",
      title: `Site audit: ${input.domain}`.slice(0, 160),
      body,
      provenance: { source: "bounded_http_crawl_worker", providerCostCents: 0 },
    });
    const report = await tx.agentReport.create({
      data: {
        publicId,
        projectId: input.projectId,
        ...payload,
        body: payload.body as Prisma.InputJsonValue,
        provenance: payload.provenance as Prisma.InputJsonValue,
        createdById: input.actorId,
        cacheReuseUntil: new Date(0),
      },
    });
    const run = await tx.siteAuditRun.create({
      data: {
        publicId,
        projectId: input.projectId,
        reportId: report.id,
        target: input.target,
        requestedPages: input.requestedPages,
        budgetPages: budget.maxPages,
        priority: budget.priority,
        frontier: { create: { url: input.target, urlHash: urlHash(input.target), depth: 0 } },
        ...(exhausted ? { state: "stopped", stopReason: budget.stopReason, completedAt: now } : {}),
      },
    });
    await rememberSiteAuditBudget(tx, run.id);
    return {
      id: publicId,
      createdAt: run.createdAt.toISOString(),
      cached: false,
      result: body,
      run: runProgress(run),
    };
  });
}

function runProgress(run: {
  state: string;
  stopReason: string | null;
  pagesCrawled: number;
  budgetPages: number;
  requests: number;
  startedAt: Date | null;
  completedAt: Date | null;
}) {
  return {
    state: run.state,
    stopReason: run.stopReason,
    pagesCrawled: run.pagesCrawled,
    budgetPages: run.budgetPages,
    requests: run.requests,
    startedAt: run.startedAt?.toISOString() ?? null,
    completedAt: run.completedAt?.toISOString() ?? null,
  };
}

export async function readSiteAuditRun(projectId: string, publicId: string) {
  const run = await prisma.siteAuditRun.findFirst({ where: { projectId, publicId } });
  return run ? runProgress(run) : null;
}

export async function readSiteAuditRunReport(projectId: string, publicId: string) {
  const run = await prisma.siteAuditRun.findFirst({ where: { projectId, publicId } });
  if (!run) return null;
  const evidence = await auditPageEvidence(prisma, run.id);
  return {
    run: runProgress(run),
    result: auditRunSummary({
      target: run.target,
      startedAt: run.startedAt ?? run.createdAt,
      completedAt: run.completedAt ?? new Date(),
      budgetPages: run.budgetPages,
      requests: run.requests,
      stopReason: (run.stopReason ?? "time_limit") as CrawlStopReason,
      ...evidence,
    }),
  };
}

export async function listSiteAuditRunPages(
  projectId: string,
  publicId: string,
  offset: number,
  limit: number,
) {
  const run = await prisma.siteAuditRun.findFirst({ where: { projectId, publicId } });
  if (!run) return null;
  const rows = await prisma.siteAuditPage.findMany({
    where: { runId: run.id },
    orderBy: { ordinal: "asc" },
    skip: offset,
    take: limit + 1,
  });
  return {
    pages: rows.slice(0, limit).map((row) => pageSchema.parse(row.facts)),
    offset,
    nextOffset: rows.length > limit ? offset + limit : null,
  };
}

export async function cancelSiteAuditRun(
  projectId: string,
  publicId: string,
  actor: SiteAuditControlActor,
) {
  const run = await prisma.siteAuditRun.findFirst({ where: { projectId, publicId } });
  if (!run) return null;
  return runProgress(await interruptSiteAuditRun(prisma, run.id, "cancelled", undefined, actor));
}

export async function resumeSiteAuditRun(
  projectId: string,
  publicId: string,
  actor: SiteAuditControlActor,
) {
  if (!(await siteAuditWorkerEnabled())) throw new Error("Site audit worker is disabled.");
  if (schedulerDriver() === "none") throw new SchedulerDisabledError();
  await assertSiteAuditOperationAccess(projectId);
  const run = await prisma.siteAuditRun.findFirst({ where: { projectId, publicId } });
  if (!run) return null;
  return prisma.$transaction(async (tx) => {
    await lockSiteAuditAdmission(tx, projectId);
    const before = await tx.siteAuditRun.findUniqueOrThrow({ where: { id: run.id } });
    if (!["paused", "stopped", "failed", "cancelled"].includes(before.state))
      return runProgress(before);
    const budget = await resolveSiteAuditBudget(
      {
        projectId,
        target: before.target,
        requestedPages: before.budgetPages,
        resuming: true,
        runId: run.id,
      },
      tx,
    );
    if (budget.maxPages === 0) return runProgress(before);
    const updated = await tx.siteAuditRun.updateMany({
      where: { id: run.id, state: before.state, generation: before.generation },
      data: {
        state: "queued",
        stopReason: null,
        completedAt: null,
        leaseToken: null,
        leaseExpiresAt: null,
        workflowId: null,
        generation: { increment: 1 },
      },
    });
    const current = await tx.siteAuditRun.findUniqueOrThrow({ where: { id: run.id } });
    if (updated.count) {
      const { actorId, ...credential } = actor;
      await writeAudit(
        {
          action: "site_audit.resume",
          actorId,
          projectId,
          targetType: "site_audit_run",
          targetId: publicId,
          before: { state: before.state, generation: before.generation },
          after: { state: current.state, generation: current.generation, ...credential },
        },
        tx,
      );
    }
    return runProgress(current);
  });
}
