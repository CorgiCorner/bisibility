import "server-only";
import { trackingAdmissionContext } from "@/lib/ai-tracking/admission/context";
import { recheckTrackingAdmission } from "@/lib/ai-tracking/admission/launch";
import type { CostReceipt, JsonValue, SamplePlan } from "@/lib/ai-tracking/contract";
import {
  freshModelCapabilities,
  retrievalEndpoint,
  trackingPayload,
} from "@/lib/ai-tracking/providers/capabilities";
import { trackingTransport } from "@/lib/ai-tracking/providers/transport";
import {
  claimTrackingSample,
  deferTrackingSamplePoll,
  getTrackingSample,
  persistTrackingResult,
  transitionTrackingSample,
} from "@/lib/ai-tracking/stores/samples";
import { prisma } from "@/lib/db/prisma";
import { createProviderRequestJournal } from "@/lib/provider-usage/request-journal";
import { createProviderRequestAttribution } from "@/lib/provider-usage/tag";
import { trackingEntityObservations } from "./observations";
import { trackingSamplePollDelayMs } from "./polling";
import { TrackingDispatchDeniedError, type TrackingExecutionPorts } from "./ports";
import { executeTrackingSample } from "./sample";

async function trackingJournal(plan: SamplePlan, estimatedCostCents = 0) {
  const attribution = await createProviderRequestAttribution(
    {
      correlationId: plan.attemptId,
      feature: "ai_tracking",
      projectId: plan.projectId,
      source: plan.entrySource,
      trigger: plan.origin,
    },
    plan.actorCredential,
    "own",
  );
  const journal = createProviderRequestJournal(prisma, {
    attribution,
    connectionId: plan.credentialConnectionId,
    projectId: plan.projectId,
    provider: plan.provider,
    credentialVersion: plan.credentialVersion,
    queued: plan.endpoint.endsWith("task_post"),
    unit: "cents",
    estimate: { cents: estimatedCostCents.toFixed(4), units: "1" },
  });
  return { journal, attribution };
}
export const trackingExecutionPorts: TrackingExecutionPorts = {
  async load(projectId, sampleId) {
    const row = await getTrackingSample(projectId, sampleId);
    if (!row) return null;
    const run = await prisma.aiTrackingRun.findFirst({
      where: { projectId, id: row.runId },
      select: { state: true },
    });
    const plan = row.plan as unknown as SamplePlan;
    if (
      plan.projectId !== projectId ||
      plan.sampleId !== row.id ||
      plan.attemptId !== row.attemptId
    )
      throw new Error("Stored tracking plan binding is invalid.");
    return {
      plan,
      dispatch: row.dispatch,
      providerTaskId: row.providerTaskId,
      receipt: row.receipt as unknown as CostReceipt | null,
      cancelled: run?.state === "cancelled",
      nextPollAt: row.nextPollAt?.toISOString() ?? null,
    };
  },
  async claim(plan) {
    return Boolean(await claimTrackingSample(plan.projectId, plan.sampleId, plan.attemptId));
  },
  async transition(plan, expected, next, taskId, receipt) {
    return Boolean(
      await transitionTrackingSample(plan.projectId, plan.sampleId, {
        attemptId: plan.attemptId,
        expectedDispatch: expected,
        nextDispatch: next,
        providerTaskId: taskId,
        receipt,
      }),
    );
  },
  async prepare(plan) {
    const context = await recheckTrackingAdmission(plan);
    await freshModelCapabilities(plan, context.credentials);
    const { journal, attribution } = await trackingJournal(plan, context.estimatedCostCents);
    return {
      observer: journal.observer,
      async submit() {
        // Recheck after the durable unknown barrier and immediately before transport.
        let fresh: Awaited<ReturnType<typeof recheckTrackingAdmission>>;
        let payload: Record<string, unknown>;
        try {
          fresh = await recheckTrackingAdmission(plan);
          const row = await prisma.aiTrackingRun.findFirst({
            where: { projectId: plan.projectId, id: plan.runId },
            select: { state: true },
          });
          if (!row || row.state === "cancelled") throw new Error("Tracking run is cancelled.");
          payload = trackingPayload(plan, attribution.tag);
        } catch (cause) {
          throw new TrackingDispatchDeniedError(cause);
        }
        return trackingTransport({
          endpoint: plan.endpoint,
          payload,
          credentials: fresh.credentials,
          deadline: plan.deadline,
          projectId: plan.projectId,
        });
      },
    };
  },
  async collect(plan, taskId) {
    const context = await trackingAdmissionContext(
      plan.projectId,
      plan.credentialConnectionId,
      true,
    );
    if (context.credentialVersion !== plan.credentialVersion)
      throw new Error("Purchased task credential changed; reconcile with the original account.");
    return trackingTransport({
      endpoint: retrievalEndpoint(plan, taskId),
      credentials: context.credentials,
      deadline: new Date(Date.now() + 30_000).toISOString(),
      projectId: plan.projectId,
    });
  },
  async deferPoll(plan) {
    const sample = await getTrackingSample(plan.projectId, plan.sampleId);
    const now = Date.now();
    await deferTrackingSamplePoll(
      plan.projectId,
      plan.sampleId,
      plan.attemptId,
      new Date(
        now + trackingSamplePollDelayMs(plan.attemptId, sample?.claimedAt ?? null, now),
      ).toISOString(),
    );
  },
  async settle(plan, receipt, failed, taskId) {
    if (!receipt.providerCostEntryId)
      throw new Error("Tracking receipt lacks its durable provider ledger entry.");
    const costCents = receipt.amountUsd === null ? null : Number(receipt.amountUsd) * 100;
    if (costCents !== null && (!Number.isFinite(costCents) || costCents > Number.MAX_SAFE_INTEGER))
      throw new Error("Tracking receipt exceeds the supported ledger amount range.");
    const { journal } = await trackingJournal(plan);
    await journal.observer.settle(receipt.providerCostEntryId, {
      cached: false,
      costCents,
      failed,
      providerRequestId: taskId,
      quantity: receipt.amountUsd === null ? null : 1,
    });
  },
  async persist(plan, input) {
    const run = await prisma.aiTrackingRun.findFirst({
      where: { projectId: plan.projectId, id: plan.runId },
      select: { competitorSnapshot: true },
    });
    input.observations = trackingEntityObservations(
      input.evidence.answerText,
      (run?.competitorSnapshot ?? []) as JsonValue,
    );
    return Boolean(await persistTrackingResult(plan.projectId, plan.sampleId, input));
  },
};
export function runTrackingSample(
  projectId: string,
  sampleId: string,
  options?: { forceCollection?: boolean },
) {
  return executeTrackingSample(trackingExecutionPorts, projectId, sampleId, options);
}
