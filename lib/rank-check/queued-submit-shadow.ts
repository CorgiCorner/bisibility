import "server-only";
import { compareAdmission } from "@/lib/metering/admission";
import { beginHostedQueuedExecution } from "@/lib/metering/hosted-sync";
import { surfaceOf } from "@/lib/provider-usage/surface";
import { resolveSerpDepth } from "@/lib/serp/constants";
import { queuedBatchAttribution } from "./queued-attribution";
import { dataForSeoQueuedEstimate } from "./queued-pricing";

type HostedQueuedBatch = Parameters<typeof queuedBatchAttribution>[0] & {
  id: string;
  priority: string;
  projectId: string;
  tasks: { rankCheck: { requestedDepth: number | null } }[];
};

/** Observe a hosted queued admission denial; the hosted ledger stays authoritative. */
export async function compareQueuedHostedAdmission(input: {
  batch: HostedQueuedBatch;
  connectionId: string;
  reason: "balance" | "budget";
}) {
  const origin = queuedBatchAttribution(input.batch);
  const priority = input.batch.priority === "normal" ? "normal" : "high";
  await compareAdmission(
    {
      connectionId: input.connectionId,
      projectId: input.batch.projectId,
      provider: "dataforseo",
      surface: surfaceOf(origin.source),
      estimatedCostCents: input.batch.tasks.reduce(
        (sum, task) =>
          sum +
          dataForSeoQueuedEstimate(
            priority,
            resolveSerpDepth(task.rankCheck.requestedDepth ?? undefined),
          ),
        0,
      ),
      credentialSource: "hosted",
      shadow: { feature: "rank_check", source: origin.source, credential: origin.credential },
    },
    input.reason === "balance" ? "wallet_blocked" : "blocked",
  );
}

/**
 * The binding just attached the batch's tasks to the hosted execution; shadow the same
 * operation through the queued metering context keyed by the execution's operation key.
 */
export async function beginQueuedHostedShadow(input: {
  batch: HostedQueuedBatch;
  connectionId: string;
  tasks: { correlationId: string; estimate: { cents: string; units: string } }[];
}) {
  const origin = queuedBatchAttribution(input.batch);
  await beginHostedQueuedExecution({
    batchId: input.batch.id,
    connectionId: input.connectionId,
    credential: origin.credential,
    projectId: input.batch.projectId,
    provider: "dataforseo",
    source: origin.source,
    tasks: input.tasks.map((task) => ({
      correlationId: task.correlationId,
      estimate: task.estimate,
    })),
  });
}
