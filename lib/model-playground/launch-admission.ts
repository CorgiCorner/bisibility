import type { ModelRunConsent } from "./admission";
import { admitModelRun } from "./admission";
import { readModelPaymentQuote } from "./admission-storage";
import { refuseUncreatedModelRun } from "./launch-failure";
import { type prepareModelConnections, resolveModelPaymentContext } from "./preview";
import type { ModelPlaygroundAccess, ModelPlaygroundRuntime } from "./runtime-contract";
import { createModelPlaygroundStore } from "./store";

export async function admitAndCreateModelRun(
  runtime: ModelPlaygroundRuntime,
  access: ModelPlaygroundAccess,
  request: {
    previewId: string;
    configHash: string;
    byokConsent?: string;
    confirmUnknown?: ModelRunConsent["confirmUnknown"];
  },
  connections: Awaited<ReturnType<typeof prepareModelConnections>>,
  preparationFailure: unknown,
  worker: boolean,
) {
  const admitted = await admitModelRun(
    runtime.db,
    {
      quoteId: request.previewId,
      actorId: access.actorId,
      projectId: access.projectId,
      configHash: request.configHash,
      consent: request.byokConsent as "non_guaranteed_estimate_v1",
      ...(request.confirmUnknown ? { confirmUnknown: request.confirmUnknown } : {}),
    },
    {
      now: runtime.now,
      readCurrent: (tx, frozen) => {
        if (preparationFailure) throw preparationFailure;
        return resolveModelPaymentContext(
          runtime,
          tx,
          access,
          frozen.context.input,
          connections,
          frozen,
        );
      },
    },
  );
  if (admitted.kind === "uncertain")
    return {
      kind: "uncertain" as const,
      message: "Run status is uncertain. Reconnect to check the saved run before trying again.",
    };
  if (admitted.kind === "not_dispatched")
    return {
      kind: "not_dispatched" as const,
      reason: admitted.reason,
      quoteInvalidated: admitted.quoteInvalidated,
      message:
        admitted.reason === "service_paused"
          ? "AI calls are temporarily paused. Try again when service resumes."
          : "The run was not started. Refresh the estimate and try again.",
    };
  if (admitted.kind === "confirmation_required")
    return {
      kind: "confirmation_required" as const,
      nonce: admitted.nonce,
      contentHash: admitted.contentHash,
      attemptIds: admitted.attemptIds,
      earlierAttemptUnconfirmed: true as const,
    };
  let run: Awaited<ReturnType<ReturnType<typeof createModelPlaygroundStore>["launch"]>>;
  try {
    const root = await runtime.db.$transaction((tx) => readModelPaymentQuote(tx, admitted.quoteId));
    if (!root) throw new Error("Missing admitted preview.");
    run = await createModelPlaygroundStore(runtime.db).launch({
      version: 1,
      requestId: admitted.quoteId,
      previewId: admitted.quoteId,
      configHash: root.quote.configHash,
      projectId: access.projectId,
      actorId: access.actorId,
    });
  } catch (error) {
    const refused =
      !admitted.replayed &&
      (await refuseUncreatedModelRun(
        runtime.db,
        access.projectId,
        admitted.quoteId,
        admitted.attempts,
        runtime.now?.() ?? new Date(),
      ).catch(() => false));
    if (refused)
      return {
        kind: "run_not_created" as const,
        message: "The run was not started. Refresh the estimate and try again.",
      };
    throw error;
  }
  if (worker)
    await runtime.db.$transaction(
      (tx) => tx.$executeRaw`UPDATE model_playground_runs
      SET "workerRequestedAt"=COALESCE("workerRequestedAt",(clock_timestamp() AT TIME ZONE 'UTC')),
          "workerProbeAt"=COALESCE("workerProbeAt",(clock_timestamp() AT TIME ZONE 'UTC'))
      WHERE id=${run.id} AND "projectId"=${access.projectId}`,
    );
  return { kind: "ready" as const, admitted, run };
}
