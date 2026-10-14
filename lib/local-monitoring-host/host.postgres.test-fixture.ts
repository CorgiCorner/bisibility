import type { SubmissionOutcome } from "@/lib/local-monitoring/execution-types";
import type { OriginalLocalProofBinding } from "@/lib/local-monitoring-store/acceptance-proof";
import { claimLocalContinuation } from "@/lib/local-monitoring-store/continuation-lease";
import type { LocalPgFixture } from "@/lib/local-monitoring-store/postgres.test-fixture";
import { localMeasurementDatabase } from "@/lib/local-monitoring-store/postgres.test-fixture";
import { prepareLocalMeasurementRun } from "@/lib/local-monitoring-store/prepare-run";
import { submissionRecordSchema } from "@/lib/local-monitoring-store/schema";
import { OriginalSubmitProofWriteError } from "./errors";
import { retainOriginalLocalSubmit } from "./proof-retention";

/** Require the real full-chain proof migration; never construct a partial fixture schema. */
export async function hostMeasurementDatabase() {
  const f = await localMeasurementDatabase();
  try {
    const result = await f.client.query<{
      proof: string | null;
      pair: string | null;
      guards: string[];
    }>(`SELECT
      to_regclass('public.local_original_submit_proofs')::text AS proof,
      to_regprocedure('public.local_submit_pair_key(text,text)')::text AS pair,
      ARRAY(SELECT tgname::text FROM pg_catalog.pg_trigger WHERE NOT tgisinternal AND tgname IN
        ('local_submit_original_custody','projects_local_execution_deletion_guard','local_items_retained_deletion_guard')) AS guards`);
    if (!result.rows[0]?.proof || !result.rows[0]?.pair || result.rows[0].guards.length !== 3)
      throw new Error("Full project-owned submit proof migration is missing.");
    return f;
  } catch (cause) {
    await f.close();
    throw cause;
  }
}

export async function hostedSubmitFixture(
  f: LocalPgFixture,
  mode: "received_lost" | "lost" | "accepted" | "partial" | "unknown_cost" | "write_failure",
) {
  const target = await f.target();
  const submit = f.ports.adapter.submit;
  const replies: SubmissionOutcome[] = [];
  const diagnostics: string[] = [];
  let originalBinding: OriginalLocalProofBinding | null = null;
  f.ports.adapter.submit = async (request) => {
    if (mode === "lost") {
      f.counters.submissions += 1;
      throw new Error("Synthetic original response loss.");
    }
    const received = await submit(request);
    const outcome: SubmissionOutcome = {
      ...received,
      acceptance: mode === "partial" ? "unknown" : received.acceptance,
      usage: mode === "unknown_cost" ? { ...received.usage, costCents: null } : received.usage,
    };
    replies.push(outcome);
    if (request.admission.outcome !== "reserved")
      throw new Error("Real prepared fixture admission missing.");
    const item = await f.db.localMeasurementRunItem.findFirstOrThrow({
      where: { preparedAttemptId: request.admission.operation.operationId },
    });
    const record = submissionRecordSchema.parse(item.record);
    originalBinding = {
      projectId: item.projectId,
      connectionId: item.connectionId,
      provider: item.provider,
      credentialVersion: item.credentialVersion,
      correlationId: item.correlationId,
      namespace: item.namespace,
      preparedAttemptId: item.preparedAttemptId,
      preparedLeaseId: item.preparedLeaseId,
      requestHash: item.requestHash,
      attemptId: request.admission.operation.operationId,
      operationKey: record.key,
      targetKey: record.targetKey,
      adapterVersion: record.adapterVersion,
      device: target.target.device,
    };
    try {
      await retainOriginalLocalSubmit(f.db, originalBinding, outcome);
    } catch (cause) {
      if (mode !== "write_failure" || !(cause instanceof OriginalSubmitProofWriteError))
        throw cause;
      diagnostics.push("store_fallback_required");
    }
    if (mode === "received_lost")
      throw new Error("Synthetic process lost reply before Store outcome.");
    return outcome;
  };
  const prepared = await prepareLocalMeasurementRun(
    f.launch([target]),
    f.writerContext,
    f.ports,
    f.db,
  );
  await prepared.submitters[0].submit();
  const item = await f.db.localMeasurementRunItem.findFirstOrThrow();
  const reference = { projectId: f.project.publicId, runId: prepared.id, targetId: target.id };
  async function lease(purpose: "collect" | "reconcile") {
    const owner = await f.db.localMeasurementTargetOwner.findFirstOrThrow({
      where: { itemId: item.id },
    });
    return claimLocalContinuation(
      { ...reference, expectedVersion: owner.version, purpose },
      f.writerContext,
      { ttlMs: 60_000, clock: f.clock },
      f.db,
    );
  }
  return {
    target,
    prepared,
    item,
    reference,
    replies,
    diagnostics,
    lease,
    binding: () => {
      if (!originalBinding) throw new Error("No received original submit binding exists.");
      return originalBinding;
    },
  };
}
