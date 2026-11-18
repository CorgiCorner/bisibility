import "server-only";
import type { ModelPaymentDatabase } from "./admission-storage";
import type { ModelPlaygroundRuntime, ModelRunIdentity } from "./runtime-contract";

/** Sets terminalAt and bumps the revision. No hook, so a receipt can terminalize without a claim. */
export async function terminalizeModelPlaygroundExecution(
  db: ModelPaymentDatabase,
  input: ModelRunIdentity,
) {
  return db.$transaction(async (tx) => {
    const [row] = await tx.$queryRaw<{ terminalAt: Date | null }[]>`SELECT "terminalAt"
      FROM model_playground_runs WHERE id=${input.runId} AND "projectId"=${input.projectId} FOR UPDATE`;
    if (!row) return false;
    if (row.terminalAt) return true;
    const [pending] = await tx.$queryRaw<{ pending: boolean }[]>`SELECT EXISTS (
      SELECT 1 FROM model_playground_columns WHERE "runId"=${input.runId}
        AND "projectId"=${input.projectId} AND state IN ('queued','claimed')) AS pending`;
    if (pending.pending) return false;
    await tx.$executeRaw`UPDATE model_playground_runs SET "terminalAt"=(clock_timestamp() AT TIME ZONE 'UTC'),
      "terminalRevision"="terminalRevision"+1 WHERE id=${input.runId} AND "projectId"=${input.projectId}`;
    return true;
  });
}

/** Terminal content and supplementary delivery commit independently. Hooks may own transactions. */
export async function finalizeModelPlaygroundExecution(
  runtime: ModelPlaygroundRuntime,
  input: ModelRunIdentity,
) {
  const terminal = await terminalizeModelPlaygroundExecution(runtime.db, input);
  if (terminal) await deliverModelPlaygroundTerminalHook(runtime, input).catch(() => undefined);
  return terminal;
}

async function deliverModelPlaygroundTerminalHook(
  runtime: ModelPlaygroundRuntime,
  input: ModelRunIdentity,
) {
  const hook = runtime.onTerminal;
  if (!hook) return;
  // A claim that died is given up at the revision it attempted, not a revision added later.
  await runtime.db.$transaction(
    (tx) => tx.$executeRaw`UPDATE model_playground_runs
    SET "terminalHookStoppedAt"=COALESCE("terminalHookStoppedAt",clock_timestamp()),
      "terminalHookStoppedRevision"="terminalHookAttemptRevision"
    WHERE id=${input.runId} AND "projectId"=${input.projectId}
      AND "terminalHookAttempts"-"terminalHookAttemptBase">=5
      AND "terminalHookAttemptRevision">"terminalHookStoppedRevision"
      AND "terminalHookDeliveredRevision"<"terminalRevision"
      AND ("terminalHookNextAt" IS NULL OR "terminalHookNextAt"<=clock_timestamp())`,
  );
  // A newer revision gets a fresh budget only after the previous five attempts are exhausted.
  await runtime.db.$transaction(
    (tx) => tx.$executeRaw`UPDATE model_playground_runs
    SET "terminalHookAttemptBase"="terminalHookAttempts","terminalHookNextAt"=NULL
    WHERE id=${input.runId} AND "projectId"=${input.projectId}
      AND "terminalHookStoppedAt" IS NOT NULL
      AND "terminalRevision">"terminalHookStoppedRevision"
      AND "terminalHookAttempts"-"terminalHookAttemptBase">=5
      AND "terminalHookAttemptBase"<"terminalHookAttempts"
      AND "terminalHookDeliveredRevision"<"terminalRevision"`,
  );
  const [claim] = await runtime.db.$transaction(
    (tx) => tx.$queryRaw<{ terminalRevision: number; terminalHookAttempts: number }[]>`
    UPDATE model_playground_runs SET "terminalHookAttemptAt"=clock_timestamp(),
      "terminalHookAttemptRevision"="terminalRevision",
      "terminalHookAttempts"="terminalHookAttempts"+1,"terminalHookNextAt"=clock_timestamp()+INTERVAL '5 minutes'
    WHERE id=${input.runId} AND "projectId"=${input.projectId} AND "terminalAt" IS NOT NULL
      AND ("terminalHookStoppedAt" IS NULL OR "terminalRevision">"terminalHookStoppedRevision")
      AND "terminalHookAttempts"-"terminalHookAttemptBase"<5
      AND "terminalHookDeliveredRevision"<"terminalRevision"
      AND ("terminalHookNextAt" IS NULL OR "terminalHookNextAt"<=clock_timestamp())
    RETURNING "terminalRevision","terminalHookAttempts"`,
  );
  if (!claim) return;
  try {
    const acknowledged = await hook(runtime.db, { ...input, revision: claim.terminalRevision });
    if (!("revision" in acknowledged)) {
      await runtime.db.$transaction(
        (tx) => tx.$executeRaw`UPDATE model_playground_runs
        SET "terminalHookAttemptBase"="terminalHookAttemptBase"+1,
          "terminalHookNextAt"=clock_timestamp()+INTERVAL '5 minutes'
        WHERE id=${input.runId} AND "projectId"=${input.projectId}
          AND "terminalHookAttempts"=${claim.terminalHookAttempts}
          AND "terminalHookDeliveredRevision"<"terminalRevision"`,
      );
      return;
    }
    if (acknowledged.revision !== claim.terminalRevision)
      throw new Error("Terminal revision not acknowledged");
    await runtime.db.$transaction(
      (tx) => tx.$executeRaw`UPDATE model_playground_runs
      SET "terminalHookDeliveredRevision"=GREATEST("terminalHookDeliveredRevision",${claim.terminalRevision}),
        "terminalHookNextAt"=NULL,"terminalHookAttemptBase"=${claim.terminalHookAttempts}
      WHERE id=${input.runId} AND "projectId"=${input.projectId}
        AND "terminalHookAttempts"=${claim.terminalHookAttempts}`,
    );
  } catch {
    await runtime.db.$transaction(
      (tx) => tx.$executeRaw`UPDATE model_playground_runs
      SET "terminalHookStoppedAt"=COALESCE("terminalHookStoppedAt",clock_timestamp()),
        "terminalHookStoppedRevision"=${claim.terminalRevision}
      WHERE id=${input.runId} AND "projectId"=${input.projectId}
        AND "terminalHookAttempts"=${claim.terminalHookAttempts}
        AND ${claim.terminalRevision}>"terminalHookStoppedRevision"
        AND "terminalHookAttempts"-"terminalHookAttemptBase">=5`,
    );
  }
}

/** Independent of workflow lifetime, including inline runs terminal before the hook was wired. */
export async function recoverModelPlaygroundTerminalHooks(runtime: ModelPlaygroundRuntime) {
  if (!runtime.onTerminal) return;
  const runs = await runtime.db.$transaction(
    (tx) => tx.$queryRaw<ModelRunIdentity[]>`
    SELECT r."projectId",r.id AS "runId" FROM model_playground_runs r
    JOIN projects p ON p.id=r."projectId"
    WHERE r."terminalAt" IS NOT NULL AND p."writeMode"='active'
      AND (r."terminalHookStoppedAt" IS NULL OR r."terminalRevision">r."terminalHookStoppedRevision")
      AND r."terminalHookDeliveredRevision"<r."terminalRevision"
      AND (r."terminalHookNextAt" IS NULL OR r."terminalHookNextAt"<=clock_timestamp())
    ORDER BY r."terminalHookNextAt" NULLS FIRST,r.id LIMIT 50`,
  );
  for (const input of runs)
    await deliverModelPlaygroundTerminalHook(runtime, input).catch(() => undefined);
}
