import type { CostReceipt, SamplePlan } from "@/lib/ai-tracking/contract";
import { assertTrackingDeadline } from "@/lib/ai-tracking/providers/dispatch-error";
import { type TrackingEnvelope, taskOutcome } from "@/lib/ai-tracking/providers/envelope";
import { normalizeTrackingResponse } from "@/lib/ai-tracking/providers/normalize";
import { trackingCostReceipt } from "@/lib/ai-tracking/reconciliation/cost";
import { ProviderUsagePersistenceError } from "@/lib/providers/usage";
import { TrackingDispatchDeniedError, type TrackingExecutionPorts } from "./ports";

async function finish(
  ports: TrackingExecutionPorts,
  plan: SamplePlan,
  envelope: TrackingEnvelope,
  receipt: CostReceipt,
  expected: "submission_started" | "collecting",
) {
  const result = normalizeTrackingResponse(plan, envelope, new Date().toISOString());
  await ports.settle(plan, receipt, result.measurement === "failed", envelope.tasks?.[0]?.id);
  const persisted = await ports.persist(plan, {
    ...result,
    observations: [],
    receipt,
    attemptId: plan.attemptId,
    expectedDispatch: expected,
  });
  return persisted ? ("terminal" as const) : ("deferred" as const);
}
export async function executeTrackingSample(
  ports: TrackingExecutionPorts,
  projectId: string,
  sampleId: string,
  options: { forceCollection?: boolean } = {},
) {
  const sample = await ports.load(projectId, sampleId);
  if (!sample || sample.dispatch === "terminal") return "terminal";
  const plan = sample.plan;
  if (
    ["submission_unknown", "submission_started"].includes(sample.dispatch) &&
    !sample.providerTaskId
  ) {
    if (sample.dispatch === "submission_started")
      await ports.transition(plan, "submission_started", "submission_unknown");
    return "submission_unknown";
  }
  if (sample.providerTaskId) {
    if (!options.forceCollection && sample.nextPollAt && Date.parse(sample.nextPollAt) > Date.now())
      return "collecting";
    if (
      sample.dispatch !== "collecting" &&
      !(await ports.transition(plan, sample.dispatch, "collecting"))
    )
      return "deferred";
    let envelope: TrackingEnvelope;
    try {
      envelope = await ports.collect(plan, sample.providerTaskId);
    } catch (error) {
      await ports.deferPoll?.(plan);
      throw error;
    }
    if (["pending", "unknown"].includes(taskOutcome(envelope))) {
      await ports.deferPoll?.(plan);
      return "collecting";
    }
    const receipt = trackingCostReceipt({
      plan,
      envelope,
      ledgerId: sample.receipt?.providerCostEntryId ?? null,
      previous: sample.receipt,
      retrieval: true,
    });
    return finish(ports, plan, envelope, receipt, "collecting");
  }
  if (sample.cancelled) return "blocked";
  if (sample.dispatch === "planned" && !(await ports.claim(plan))) return "deferred";
  if (!["planned", "claimed"].includes(sample.dispatch)) return "deferred";
  let prepared: Awaited<ReturnType<TrackingExecutionPorts["prepare"]>>;
  try {
    assertTrackingDeadline(plan.deadline);
    prepared = await ports.prepare(plan);
  } catch (error) {
    const result = normalizeTrackingResponse(plan, {}, new Date().toISOString());
    const message = error instanceof Error ? error.message : "";
    const reason = /model|capabilit|pricing|price/i.test(message)
      ? "unsupported_or_unpriced_model"
      : /budget|allocation/i.test(message)
        ? "budget_exhausted"
        : /credential/i.test(message)
          ? "credential_changed"
          : /actor|forbidden|scope|consent/i.test(message)
            ? "authorization_changed"
            : /paused|archived/i.test(message)
              ? "prompt_inactive"
              : /deadline/i.test(message)
                ? "deadline_expired"
                : "admission_refused";
    result.evidence.providerStatus = reason;
    await ports.persist(plan, {
      ...result,
      measurement: "unavailable",
      observations: [],
      receipt: { providerCostEntryId: null, amountUsd: "0", state: "confirmed" },
      attemptId: plan.attemptId,
      expectedDispatch: "claimed",
    });
    return "blocked";
  }
  let ledgerId: string;
  try {
    ledgerId = await prepared.observer.begin({ attemptKey: plan.attemptId });
  } catch (error) {
    if (error instanceof ProviderUsagePersistenceError && error.attemptId) {
      await ports.transition(plan, "claimed", "submission_unknown", undefined, {
        providerCostEntryId: error.attemptId,
        amountUsd: null,
        state: "unknown",
      });
      return "submission_unknown";
    }
    throw error;
  }
  const unknown: CostReceipt = { providerCostEntryId: ledgerId, amountUsd: null, state: "unknown" };
  try {
    await prepared.observer.beforeDispatch?.(ledgerId);
    if (!(await ports.transition(plan, "claimed", "submission_started", undefined, unknown))) {
      await prepared.observer.cancel?.(ledgerId);
      return "deferred";
    }
  } catch (error) {
    await prepared.observer.cancel?.(ledgerId);
    throw error;
  }
  let envelope: TrackingEnvelope;
  try {
    envelope = await prepared.submit();
  } catch (error) {
    if (error instanceof TrackingDispatchDeniedError) {
      await prepared.observer.settle(ledgerId, {
        cached: false,
        costCents: 0,
        quantity: 0,
        failed: true,
      });
      const result = normalizeTrackingResponse(plan, {}, new Date().toISOString());
      result.evidence.providerStatus = error.reason;
      const persisted = await ports.persist(plan, {
        ...result,
        measurement: "unavailable",
        observations: [],
        receipt: { providerCostEntryId: ledgerId, amountUsd: "0", state: "confirmed" },
        attemptId: plan.attemptId,
        expectedDispatch: "submission_started",
      });
      return persisted ? "blocked" : "deferred";
    }
    await ports.transition(plan, "submission_started", "submission_unknown");
    return "submission_unknown";
  }
  const receipt = trackingCostReceipt({ plan, envelope, ledgerId, retrieval: false });
  const taskId = envelope.tasks?.[0]?.id;
  if (plan.endpoint.endsWith("task_post") && taskId && taskOutcome(envelope) !== "failed") {
    if (!(await ports.transition(plan, "submission_started", "submitted", taskId, receipt)))
      return "deferred";
    // Update the original ledger row with the purchase; GET may later correct its refund.
    await ports.settle(plan, receipt, false, taskId);
    return "submitted";
  }
  if (taskOutcome(envelope) === "unknown") {
    await ports.transition(plan, "submission_started", "submission_unknown", taskId, receipt);
    return "submission_unknown";
  }
  return finish(ports, plan, envelope, receipt, "submission_started");
}
