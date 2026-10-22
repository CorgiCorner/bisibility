import "server-only";
import type { WorkerDefinitionSession } from "@/lib/measurement-definitions/worker-session";
import { createProviderRequestAttribution } from "@/lib/provider-usage/tag";
import { serpRankLocation } from "@/lib/serp/location";
import { locationForProvider } from "./fallback-location";
import { queuedBatchAttribution } from "./queued-attribution";
import { queuedBillingUnits } from "./queued-pricing";
import { queuedRequestCosts } from "./queued-request-costs";
import type { claimQueuedSubmission } from "./queued-submit-claim";
import { queuedRankPaymentLimit } from "./runs/payment-queued";

/** One provider task per queued rank-check task, priced for the usage journal. */
export async function submissionTasks(
  batch: Awaited<ReturnType<typeof claimQueuedSubmission>>["batch"],
  definitions: ReadonlyMap<string, WorkerDefinitionSession>,
) {
  const origin = queuedBatchAttribution(batch);
  if (!batch.connection) throw new Error("Queued provider connection is unavailable");
  const costs = await queuedRequestCosts(
    batch.connection,
    batch.tasks.map((task) => ({
      keyword: requiredRequest(definitions, task.id).keyword,
      depth: requiredRequest(definitions, task.id).depth,
    })),
    batch.priority === "normal" ? "normal" : "high",
  );
  return Promise.all(
    batch.tasks.map(async (task, index) => {
      const request = requiredRequest(definitions, task.id);
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
        maxCostCents: await queuedRankPaymentLimit(task.rankCheckId),
        estimate: {
          cents: costs[index].toFixed(4),
          units: String(queuedBillingUnits(request.depth)),
        },
        correlationId: task.id,
        depth: request.depth,
        device: request.device,
        domain: request.domain,
        keyword: request.keyword,
        keywordId: task.keywordId,
        location: locationForProvider(
          "dataforseo",
          serpRankLocation(request.location),
          request.location.kind === "city",
        ),
        stopOnMatch: request.stopOnMatch,
        attribution,
        tag: attribution.tag,
      };
    }),
  );
}

function requiredRequest(
  definitions: ReadonlyMap<string, WorkerDefinitionSession>,
  taskId: string,
) {
  const request = definitions.get(taskId)?.binding.request;
  if (!request || request.providerId !== "dataforseo")
    throw new Error("Original queued request is unavailable.");
  return request;
}
