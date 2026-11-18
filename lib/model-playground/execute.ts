import "server-only";
import {
  createModelRequestJournal,
  ModelDispatchRefusal,
} from "@/lib/provider-usage/model-request-journal";
import type { ModelUsageObserver } from "@/lib/providers/model/types";
import { after } from "next/server";
import { type ModelAttempt, readModelPaymentQuote } from "./admission-storage";
import {
  claimModelDispatch,
  modelRefusalReason,
  persistedModelResult,
  refuseUnstartedModelColumn,
} from "./execution-storage";
import { ModelAdmissionRefusal } from "./payment";
import { prepareModelConnections, resolveModelPaymentContext } from "./preview";
import { finalizeModelPlaygroundExecution, recoverModelPlayground } from "./recovery";
import { finalizeModelPlaygroundReport } from "./report-finalize";
import { isStoredReportRunTerminal } from "./report-readiness";
import type { ModelPlaygroundRuntime } from "./runtime-contract";
import { MODEL_PLAYGROUND_LIMITS } from "./schema";
import { type ModelPlaygroundDatabase, storeTransaction } from "./store-db";
import { completeObservedModelColumn, requirePaidObservation } from "./store-observed";
import type { ModelColumnResult } from "./types";

export type ModelExecutionInput = {
  runId: string;
  projectId: string;
  attempts: ModelAttempt[];
  delivery?: "worker";
};
export type ModelColumnExecution = {
  attemptId: string;
  state: "finished" | "pending" | "already_dispatched" | "refused";
  reason?: NonNullable<ModelAttempt["refusalReason"]>;
  result?: ModelColumnResult;
};

async function finalizeReport(runtime: ModelPlaygroundRuntime, runId: string, terminal: boolean) {
  if (!terminal) return;
  try {
    await finalizeModelPlaygroundReport(runId, runtime.db);
  } catch {
    /* Optional work only. The durable sweep retries a reportless terminal run. */
  }
}

/** Inline and durable workers consume admitted attempts, never a new reservation. */
export async function executeModelPlayground(
  runtime: ModelPlaygroundRuntime,
  input: ModelExecutionInput,
): Promise<ModelColumnExecution[]> {
  const queue = [...input.attempts];
  const deadline = Date.now() + 240_000;
  const results: ModelColumnExecution[] = [];
  let terminal = false;
  let finished = false;
  const worker = async () => {
    for (let next = queue.shift(); next; next = queue.shift()) {
      const execution = await executeModelColumn(runtime, input, next, deadline, () => {
        terminal = true;
      });
      if (execution.state === "finished") finished = true;
      results.push(execution);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(MODEL_PLAYGROUND_LIMITS.inflight, queue.length) }, worker),
  );
  const identity = { projectId: input.projectId, runId: input.runId };
  if (!terminal && finished) {
    try {
      terminal = await storeTransaction(runtime.db as unknown as ModelPlaygroundDatabase, (tx) =>
        isStoredReportRunTerminal(tx, identity),
      );
    } catch {
      /* Readiness is supplementary. Retained answers still return. */
    }
  }
  try {
    await recoverModelPlayground(runtime, identity);
  } catch {
    /* Supplementary recovery cannot suppress a paid answer. */
  }
  const deliverHook = () =>
    finalizeModelPlaygroundExecution(runtime, identity).catch(() => undefined);
  if (input.delivery === "worker") {
    await deliverHook();
  } else if (runtime.onTerminal) {
    try {
      after(() => deliverHook());
    } catch {
      await deliverHook();
    }
  } else if (terminal) {
    try {
      await finalizeModelPlaygroundExecution(runtime, identity);
    } catch {
      /* A terminal marker failure cannot suppress a paid answer. */
    }
    try {
      after(() => finalizeReport(runtime, input.runId, true));
    } catch {
      /* Non-request workers use the durable recovery sweep. Never fail paid answers. */
    }
  }
  return results;
}

async function executeModelColumn(
  runtime: ModelPlaygroundRuntime,
  input: ModelExecutionInput,
  attempt: ModelAttempt,
  deadline: number,
  onTerminal: () => void,
): Promise<ModelColumnExecution> {
  if (attempt.dispatched) return { attemptId: attempt.id, state: "already_dispatched" };
  if (attempt.refusalReason)
    return { attemptId: attempt.id, state: "refused", reason: attempt.refusalReason };
  const identity = {
    projectId: input.projectId,
    runId: input.runId,
    columnId: attempt.rootColumnId,
  };
  const stop = async (
    reason: NonNullable<ModelAttempt["refusalReason"]>,
  ): Promise<ModelColumnExecution> => {
    try {
      const { finalizeReport: becameTerminal = false, ...execution } =
        await refuseUnstartedModelColumn(runtime.db, identity, attempt, reason);
      if (becameTerminal) onTerminal();
      return execution;
    } catch {
      return { attemptId: attempt.id, state: "pending" };
    }
  };
  const wait = runtime.wait ?? ((ms) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  for (let retry = 0; retry < 32; retry++) {
    if (Date.now() + 75_000 >= deadline)
      return input.delivery === "worker"
        ? { attemptId: attempt.id, state: "pending" }
        : stop("reservation_unavailable");
    let refusal: unknown;
    let observed: ModelColumnResult | undefined;
    let marked = false;
    try {
      const retained = await runtime.db.$transaction((tx) =>
        readModelPaymentQuote(tx, attempt.quoteId),
      );
      if (!retained) return stop("quote_missing");
      const quote = retained.quote;
      const access = await runtime.authorize("create").catch(() => {
        throw new ModelAdmissionRefusal("access_denied");
      });
      if (
        access.actorId !== quote.context.actorId ||
        access.projectId !== input.projectId ||
        access.principal !== quote.context.principal
      )
        throw new ModelAdmissionRefusal("access_denied");
      const one = { ...quote.context.input, columns: [attempt.binding.column] };
      const connections = await prepareModelConnections(runtime, access, one);
      const column = attempt.binding.column;
      const connection = connections.get(column.columnId);
      if (!connection) throw new ModelAdmissionRefusal("connection_unavailable");
      const ports = {
        now: runtime.now,
        readCurrent: (tx: Parameters<typeof resolveModelPaymentContext>[1]) =>
          resolveModelPaymentContext(
            runtime,
            tx,
            access,
            quote.context.input,
            connections,
            quote,
            attempt.id,
          ),
      };
      const journal = createModelRequestJournal(runtime.db, ports);
      const observer: ModelUsageObserver = {
        async beforeDispatch(id) {
          try {
            await claimModelDispatch(runtime.db, identity, attempt.id, (db) =>
              createModelRequestJournal(db, ports).beforeDispatch(id),
            );
            marked = true;
          } catch (error) {
            refusal = error;
            throw error;
          }
        },
        async settle(id, result, interruption) {
          observed = result;
          // Accounting settles first, including when the observation check throws.
          try {
            try {
              await requirePaidObservation(runtime.db, {
                ...identity,
                attemptId: attempt.id,
              });
            } finally {
              await journal.settle(id, result, interruption);
            }
          } finally {
            try {
              const terminal = await completeObservedModelColumn(
                runtime.db,
                { ...identity, attemptId: attempt.id },
                persistedModelResult({
                  ...result,
                  column: { ...column, columnId: attempt.rootColumnId },
                }),
              );
              if (terminal) onTerminal();
            } catch {
              /* Retention cannot suppress settlement or the paid answer. */
            }
          }
        },
      };
      observed = await connection.adapter.generate(
        {
          apiKey: connection.apiKey,
          accountDigest: connection.accountDigest,
          signal: AbortSignal.timeout(75_000),
          ...(column.settings.workspaceId ? { workspaceId: column.settings.workspaceId } : {}),
        },
        {
          column,
          operationKey: attempt.id,
          prompt: quote.context.input.prompt,
          responseLanguage: quote.context.input.responseLanguage,
        },
        observer,
      );
    } catch (error) {
      if (!observed) {
        if (refusal instanceof ModelDispatchRefusal && refusal.retryable) {
          try {
            await wait(Math.min(250 * 2 ** retry, 4_000));
          } catch {
            return input.delivery === "worker"
              ? { attemptId: attempt.id, state: "pending" }
              : stop("reservation_unavailable");
          }
          continue;
        }
        if (refusal instanceof ModelDispatchRefusal && refusal.reason === "already_dispatched")
          return { attemptId: attempt.id, state: "already_dispatched" };
        if (!marked)
          return stop(
            modelRefusalReason(refusal) ?? modelRefusalReason(error) ?? "reservation_unavailable",
          );
      }
    }
    if (observed) {
      const result = {
        ...observed,
        column: { ...attempt.binding.column, columnId: attempt.rootColumnId },
      };
      try {
        const terminal = await completeObservedModelColumn(
          runtime.db,
          { ...identity, attemptId: attempt.id },
          persistedModelResult(result),
        );
        if (terminal) onTerminal();
      } catch {
        /* Keep the paid answer. */
      }
      return { attemptId: attempt.id, state: "finished", result };
    }
    return { attemptId: attempt.id, state: "pending" };
  }
  return input.delivery === "worker"
    ? { attemptId: attempt.id, state: "pending" }
    : stop("reservation_unavailable");
}
