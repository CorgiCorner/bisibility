import "server-only";
import { createProviderRequestAttribution } from "@/lib/provider-usage/tag";
import type { SerpDevice } from "@/lib/providers/types";
import { trackedProjectDomain } from "@/lib/schemas/project";
import { resolveSerpDepth, resolveSerpStopOnMatch } from "@/lib/serp/constants";
import { serpRankLocation } from "@/lib/serp/location";
import { queuedBatchAttribution } from "./queued-attribution";
import { dataForSeoQueuedEstimate, queuedBillingUnits } from "./queued-pricing";
import type { claimQueuedSubmission } from "./queued-submit-claim";

/** One provider task per queued rank-check task, priced for the usage journal. */
export async function submissionTasks(
  batch: Awaited<ReturnType<typeof claimQueuedSubmission>>["batch"],
) {
  const origin = queuedBatchAttribution(batch);
  return Promise.all(
    batch.tasks.map(async (task) => {
      const attribution = await createProviderRequestAttribution(
        {
          correlationId: task.id,
          feature: "rank_check",
          projectId: batch.projectId,
          source: origin.source,
          trigger: origin.trigger,
        },
        origin.credential,
        batch.connection?.credentialSource === "hosted" ? "hosted" : undefined,
      );
      return {
        estimate: {
          cents: dataForSeoQueuedEstimate(
            batch.priority === "normal" ? "normal" : "high",
            resolveSerpDepth(task.rankCheck.requestedDepth ?? undefined),
          ).toFixed(4),
          units: String(
            queuedBillingUnits(resolveSerpDepth(task.rankCheck.requestedDepth ?? undefined)),
          ),
        },
        correlationId: task.id,
        depth: resolveSerpDepth(task.rankCheck.requestedDepth ?? undefined),
        device: task.keyword.device as SerpDevice,
        domain: trackedProjectDomain(batch.project.domain) ?? "",
        keyword: task.keyword.text,
        keywordId: task.keywordId,
        location: serpRankLocation(task.keyword.locationRef),
        stopOnMatch: resolveSerpStopOnMatch(batch.project.defaults?.serpStopOnMatch),
        attribution,
        tag: attribution.tag,
      };
    }),
  );
}
