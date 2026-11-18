import "server-only";
import { z } from "zod";
import type { ModelAdmissionResult } from "./admission";
import { readModelPaymentQuote } from "./admission-storage";
import { executeModelPlayground } from "./execute";
import { admitAndCreateModelRun } from "./launch-admission";
import type {
  ModelPlaygroundConfirmationRequired,
  ModelPlaygroundLaunchRejection,
  ModelPlaygroundLaunchResult,
} from "./launch-service";
import type { ModelAdmissionReason } from "./payment";
import { modelPaymentTransaction } from "./payment-transaction";
import { prepareModelConnections } from "./preview";
import { readModelPlayground } from "./read";
import type { ModelPlaygroundRuntime } from "./runtime-contract";
import { transactionDatabase } from "./runtime-transaction";
import { modelPlaygroundLaunchSchema } from "./schema";
import { modelPlaygroundWorkerEnabled } from "./worker-config";

const launchSchema = modelPlaygroundLaunchSchema.extend({
  revision: z.string().min(1).max(256),
  confirmUnknown: z
    .object({
      nonce: z.uuid(),
      contentHash: z.string().regex(/^[a-f0-9]{64}$/),
      attemptIds: z.array(z.string().min(1).max(256)).min(1).max(100),
    })
    .strict()
    .optional(),
});
export type ModelLaunchOutcome =
  | Extract<ModelPlaygroundLaunchRejection, { kind: "invalid_request" }>
  | Extract<ModelPlaygroundLaunchRejection, { kind: "run_not_created" }>
  | { kind: "access_denied" | "feature_disabled"; message: string }
  | {
      kind: "not_dispatched";
      reason: ModelAdmissionReason;
      quoteInvalidated: boolean;
      message: string;
    }
  | ModelPlaygroundConfirmationRequired
  | {
      kind: "admitted";
      result: ModelPlaygroundLaunchResult;
      admission?: Extract<ModelAdmissionResult, { kind: "admitted" }>;
    }
  | { kind: "uncertain"; message: string };

/** Unexpected failures never claim that a possibly committed admission did not happen. */
export async function launchModelPlayground(
  runtime: ModelPlaygroundRuntime,
  value: unknown,
  onCommitted?: () => void,
  includeAdmission = false,
): Promise<ModelLaunchOutcome> {
  let access: Awaited<ReturnType<ModelPlaygroundRuntime["authorize"]>>;
  try {
    access = await runtime.authorize("create");
  } catch {
    return { kind: "access_denied", message: "You cannot run this project." };
  }
  const parsed = launchSchema.safeParse(value);
  if (!parsed.success)
    return {
      kind: "invalid_request",
      message: "Invalid run request.",
      reason: "validation_failed",
    };
  const request = parsed.data;
  if (request.quoteToken !== request.previewId)
    return {
      kind: "invalid_request",
      message: "Invalid quote reference.",
      reason: "validation_failed",
    };
  let frozen: Awaited<ReturnType<typeof readModelPaymentQuote>>;
  try {
    frozen = await runtime.db.$transaction((tx) => readModelPaymentQuote(tx, request.previewId));
  } catch {
    return { kind: "uncertain", message: "Reconnect to check the saved run before trying again." };
  }
  if (
    !frozen ||
    frozen.quote.context.projectId !== access.projectId ||
    frozen.quote.context.actorId !== access.actorId
  )
    return {
      kind: "invalid_request",
      message: "Invalid quote reference.",
      reason: "not_found",
    };
  try {
    let connections: Awaited<ReturnType<typeof prepareModelConnections>> = new Map();
    let preparationFailure: unknown;
    try {
      connections = await prepareModelConnections(runtime, access, frozen.quote.context.input);
    } catch (error) {
      preparationFailure = error;
    }
    const worker = modelPlaygroundWorkerEnabled();
    const admit = (scoped: ModelPlaygroundRuntime) =>
      admitAndCreateModelRun(scoped, access, request, connections, preparationFailure, worker);
    const created = worker
      ? await modelPaymentTransaction(runtime.db, (tx) =>
          admit({ ...runtime, db: transactionDatabase(tx) }),
        )
      : await admit(runtime);
    if (created.kind !== "ready") return created;
    const { admitted, run } = created;
    if (!admitted.replayed) onCommitted?.();
    const execution = { runId: run.id, projectId: access.projectId, attempts: admitted.attempts };
    const executions = worker ? [] : await executeModelPlayground(runtime, execution);
    if (worker) {
      // Admission, run and intent are committed. The pending probe repairs any lost wake.
      await import("@/lib/worker-intents/realtime")
        .then(({ publishWorkerIntent }) => publishWorkerIntent("model_playground"))
        .catch(() => undefined);
    }
    const read =
      (await readModelPlayground(runtime, run.id).catch(() => null)) ??
      ({ runId: run.id, columns: [] } as ModelPlaygroundLaunchResult);
    // Preserve a paid answer in this response even when result persistence was temporarily unavailable.
    for (const execution of executions) {
      if (!execution.result) continue;
      const index = read.columns.findIndex(
        (c) => c.column.columnId === execution.result?.column.columnId,
      );
      if (index < 0) read.columns.push(execution.result);
      else if (execution.state === "finished") read.columns[index] = execution.result;
    }
    return {
      kind: "admitted",
      // Admission bindings stay server-side unless an explicit server adapter requests them.
      ...(includeAdmission ? { admission: admitted } : {}),
      result: {
        ...read,
        columnAttempts: admitted.columnAttempts,
        replayed: admitted.replayed,
        ...(admitted.replacementRefusal ? { replacementRefusal: admitted.replacementRefusal } : {}),
      },
    };
  } catch {
    return {
      kind: "uncertain",
      message: "Run status is uncertain. Reconnect to check the saved run before trying again.",
    };
  }
}
