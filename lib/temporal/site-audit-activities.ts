import "server-only";

import { Context } from "@temporalio/activity";
import { prisma } from "../db/prisma";
import { crawlSiteAuditBatch } from "../site-audit/batch";
import { readAdmittedCrawlBudget } from "../site-audit/budget-extension";
import { interruptSiteAuditRun } from "../site-audit/interrupt";
import { createCrawlStore } from "../site-audit/pages-store";
import { siteAuditWorkerEnabled } from "../site-audit/worker-config";
import { heartbeatingActivity } from "./heartbeating-activity";

export async function failSiteAuditActivity(input: { runId: string; generation: number }) {
  const row = await interruptSiteAuditRun(prisma, input.runId, "failed", input.generation);
  if (row.generation !== input.generation)
    return {
      state: "cancelled" as const,
      pagesCrawled: row.pagesCrawled,
      stopReason: "cancelled" as const,
    };
  return {
    state: row.state as "failed" | "cancelled" | "stopped" | "complete" | "paused",
    pagesCrawled: row.pagesCrawled,
    stopReason: row.stopReason as
      | "error"
      | "cancelled"
      | "page_budget"
      | "monthly_pool"
      | "unverified_cap"
      | "time_limit"
      | "finished"
      | null,
  };
}

export async function crawlSiteAuditBatchActivity(input: { runId: string; generation: number }) {
  if (!(await siteAuditWorkerEnabled())) {
    const row = await interruptSiteAuditRun(prisma, input.runId, "paused", input.generation);
    return { state: "paused" as const, pagesCrawled: row.pagesCrawled, stopReason: null };
  }
  return heartbeatingActivity({ details: { runId: input.runId }, heartbeatMs: 10_000 }, (signal) =>
    crawlSiteAuditBatch(input.runId, {
      store: createCrawlStore(prisma, input.generation),
      budget: readAdmittedCrawlBudget,
      signal,
      heartbeat: (pages) => {
        try {
          Context.current().heartbeat({ runId: input.runId, pages });
        } catch {
          /* Direct test invocation has no activity context. */
        }
      },
    }),
  );
}
