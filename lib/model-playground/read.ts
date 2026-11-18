import { readModelObservation } from "./interruption";
import "server-only";
import { transportEvidence } from "@/lib/providers/model/transport-evidence";
import { z } from "zod";
import { readModelAttempts } from "./admission-storage";
import { modelColumnState, storedColumnPhase } from "./column-state";
import type { ModelPlaygroundLaunchResult } from "./launch-service";
import { ModelAdmissionRefusal } from "./payment";
import { fitModelResult } from "./result-budget";
import { modelResultWithUsageEstimate } from "./result-estimate";
import type { ModelPlaygroundRuntime } from "./runtime-contract";
import { createModelPlaygroundStore } from "./store";
import { ModelPlaygroundStoreError } from "./store-db";
import { modelColumnResultSchema } from "./types";

/** Result reads have no resolver, adapter, observer or dispatch side effects. */
export async function readModelPlayground(
  runtime: ModelPlaygroundRuntime,
  runId: string,
): Promise<ModelPlaygroundLaunchResult | null> {
  let access: Awaited<ReturnType<ModelPlaygroundRuntime["authorize"]>>;
  try {
    access = await runtime.authorize("read");
  } catch {
    return null;
  }
  if (!z.uuid().safeParse(runId).success) return null;
  try {
    const store = createModelPlaygroundStore(runtime.db);
    const run = await store.read(access.projectId, runId).catch(async (error) => {
      if (!(error instanceof ModelPlaygroundStoreError) || error.code !== "not_found") throw error;
      // The browser knows the quote while its synchronous launch request is still running.
      const [pending] = await runtime.db.$transaction(
        (tx) => tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM model_playground_runs WHERE "projectId"=${access.projectId} AND "requestId"=${runId}`,
      );
      if (!pending) throw error;
      return store.read(access.projectId, pending.id);
    });
    const attempts = await runtime.db.$transaction((tx) =>
      readModelAttempts(tx, run.previewId, runtime.now?.()),
    );
    const progress = run.columns.map((stored) => {
      const attempt = attempts.find((a) => a.rootColumnId === stored.columnId);
      const phase = storedColumnPhase(stored);
      const state = modelColumnState(attempt?.state ?? "admitted", phase);
      return {
        columnId: stored.columnId,
        poll: state?.poll === true,
        state: state?.poll
          ? (attempt?.state ?? "queued")
          : state?.show === "not_started"
            ? "refused"
            : state?.show === "answer"
              ? "observed"
              : "stale_unknown",
      };
    });
    const columnAttempts = Object.fromEntries(attempts.map((a) => [a.rootColumnId, a.id]));
    const observations = await runtime.db.$transaction(
      (tx) => tx.$queryRaw<{ attemptId: string; response: unknown }[]>`
      SELECT DISTINCT ON (a.id) a.id AS "attemptId",o.response FROM model_playground_payment_attempts a
      JOIN model_playground_payment_observations o ON o.attempt_id=a.id
      WHERE COALESCE(a.root_quote_id,a.quote_id)=${run.previewId} AND a.superseded_at IS NULL
      ORDER BY a.id,o.created_at ASC,o.id`,
    );
    const columns = run.columns.flatMap((stored) => {
      // Stored column results keep their original full config; observations can come from a replacement.
      const attempt = attempts.find((a) => a.rootColumnId === stored.columnId);
      const raw = readModelObservation(
        observations.find((o) => o.attemptId === attempt?.id)?.response,
      ).response;
      let observed = modelColumnResultSchema.safeParse(raw);
      if (!observed.success && raw) {
        try {
          observed = modelColumnResultSchema.safeParse(
            fitModelResult(raw as import("./types").ModelColumnResult),
          );
        } catch {
          /* A malformed observation cannot hide a validated stored result. */
        }
      }
      const fromJournal = observed.success ? { ...observed.data, column: stored.config } : null;
      const value = richerModelResult(stored.result, fromJournal);
      if (!value && progress.some((p) => p.columnId === stored.columnId && p.state === "observed"))
        return [
          {
            ...transportEvidence(stored.config, Date.parse(run.snapshot.createdAt), null),
            state: "unknown" as const,
            failure: "accounting_unknown" as const,
            truncation: {
              provider: false,
              application: false,
              citations: false,
              metadata: true as const,
            },
          },
        ];
      if (!value && attempt?.refusalReason)
        return [
          {
            ...transportEvidence(stored.config, Date.parse(run.snapshot.createdAt), null),
            state: "cancelled" as const,
            failure: "refused" as const,
            finishedAt: run.snapshot.createdAt,
            durationMs: 0,
          },
        ];
      return value
        ? [modelColumnResultSchema.parse(modelResultWithUsageEstimate(value, attempt?.binding))]
        : [];
    });
    // Report navigation is supplementary; its lookup cannot hide retained answers.
    const reportId = run.reportId
      ? await runtime.db
          .$transaction(
            (tx) => tx.$queryRaw<{ publicId: string }[]>`
              SELECT "publicId" FROM agent_reports
              WHERE "projectId"=${access.projectId} AND id=${run.reportId}`,
          )
          .then((rows) => rows[0]?.publicId)
          .catch(() => undefined)
      : undefined;
    return {
      runId: run.id,
      ...(reportId ? { reportId } : {}),
      columns,
      progress,
      columnAttempts,
    };
  } catch (error) {
    if (error instanceof ModelPlaygroundStoreError && error.code === "not_found") return null;
    if (error instanceof ModelAdmissionRefusal) return null;
    throw error;
  }
}

function richerModelResult(
  stored: import("./types").ModelColumnResult | null,
  observed: import("./types").ModelColumnResult | null,
) {
  if (!stored || !observed) return stored ?? observed;
  const score = (result: import("./types").ModelColumnResult) => [
    result.answer === null ? -1 : result.answer.length,
    Number(!result.truncation.application),
    result.citations.length + (result.consultedSources?.sources.length ?? 0),
  ];
  const a = score(stored),
    b = score(observed);
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return b[i] > a[i] ? observed : stored;
  return stored;
}
