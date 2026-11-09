import { continueAsNew, isCancellation, proxyActivities, sleep } from "@temporalio/workflow";
import type { CrawlProgress } from "../site-audit/run-contract";
import type { crawlSiteAuditBatchActivity, failSiteAuditActivity } from "./site-audit-activities";

const { crawlSiteAuditBatchActivity: crawl, failSiteAuditActivity: fail } = proxyActivities<{
  crawlSiteAuditBatchActivity: typeof crawlSiteAuditBatchActivity;
  failSiteAuditActivity: typeof failSiteAuditActivity;
}>({
  startToCloseTimeout: "2 minutes",
  heartbeatTimeout: "30 seconds",
  retry: { initialInterval: "5 seconds", maximumInterval: "30 seconds", maximumAttempts: 10 },
});

export async function siteAuditCrawlWorkflow(input: {
  runId: string;
  generation?: number;
  batches?: number;
}): Promise<CrawlProgress> {
  let batches = input.batches ?? 0;
  while (true) {
    let progress: Awaited<ReturnType<typeof crawl>>;
    try {
      progress = await crawl({ runId: input.runId, generation: input.generation ?? 0 });
    } catch (error) {
      if (isCancellation(error)) throw error;
      return fail({ runId: input.runId, generation: input.generation ?? 0 });
    }
    if (!["queued", "running"].includes(progress.state)) return progress;
    batches++;
    if (batches >= 20)
      return continueAsNew<typeof siteAuditCrawlWorkflow>({ ...input, batches: 0 });
    await sleep("1 second");
  }
}
