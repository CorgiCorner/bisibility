import "server-only";
import { randomUUID } from "node:crypto";
import { agentReportSchema } from "@/lib/agent-reports/model";
import type { PlaygroundEntity } from "@/lib/ai-research/model-playground-view";
import { makePublicId } from "@/lib/db/public-id-resources";
import { isProjectReadOnly } from "@/lib/deployment/project-write-mode";
import {
  buildModelPlaygroundReport,
  ModelPlaygroundReportBudgetError,
  modelPlaygroundReportSchema,
} from "./report-body";
import {
  recordReportFailure,
  recordReportRepairBackoff,
  recordReportStorageFailure,
  reportBookkeepingSchema,
  reportRecoveryEligibleSql,
} from "./report-bookkeeping";
import { isStoredReportRunTerminal } from "./report-readiness";
import { refreshSavedModelReport } from "./report-refresh";
import { readStoredRun } from "./store";
import { type ModelPlaygroundDatabase, queryRows, storeTransaction } from "./store-db";
import { storeIdentitySchema } from "./store-validation";

export type ReportSaveResult =
  | { ok: true; reportId: string; alreadySaved: boolean }
  | { ok: false; reason: "held" }
  | {
      ok: false;
      reason:
        | "invalid_input"
        | "pending"
        | "not_found"
        | "conflict"
        | "too_large"
        | "storage"
        | "read_only"
        | "dismissed"
        | "backoff"
        | "unclassified";
    };

/** Authorized finalization is supplementary: failure never changes a retained answer. */
export async function saveModelPlaygroundReport(
  db: ModelPlaygroundDatabase,
  input: { projectId: string; runId: string },
  entities: readonly PlaygroundEntity[],
  recovery = false,
  explicit = false,
  options?: { userSave?: boolean },
): Promise<ReportSaveResult> {
  if (!storeIdentitySchema.safeParse(input).success) return { ok: false, reason: "invalid_input" };
  try {
    return await storeTransaction(db, async (tx): Promise<ReportSaveResult> => {
      // Hold the mode stable until commit, including worker finalization without an actor.
      const projects = await queryRows<{ writeMode: string }>(
        tx,
        `SELECT "writeMode" FROM projects WHERE id=$1 FOR SHARE`,
        input.projectId,
      );
      if (!projects[0]) return { ok: false, reason: "not_found" };
      const locked = await queryRows(
        tx,
        `SELECT id FROM model_playground_runs WHERE "projectId"=$1 AND id=$2 FOR UPDATE`,
        input.projectId,
        input.runId,
      );
      if (!locked.length) return { ok: false, reason: "not_found" };
      const [bookkeeping] = await queryRows<{
        reportState: string;
        reportId: string | null;
        reportAttemptedAt: Date | null;
        reportFailure: string | null;
        eligible: boolean;
      }>(
        tx,
        `SELECT r."reportState",r."reportId",r."reportAttemptedAt",r."reportFailure",${reportRecoveryEligibleSql} AS eligible FROM model_playground_runs r WHERE r.id=$1`,
        input.runId,
      );
      const { eligible, ...storedBookkeeping } = bookkeeping;
      reportBookkeepingSchema.parse(storedBookkeeping);
      if (bookkeeping.reportState === "dismissed") return { ok: false, reason: "dismissed" };
      if (bookkeeping.reportState === "unclassified" && !explicit)
        return { ok: false, reason: "unclassified" };
      const run = await readStoredRun(tx, input.projectId, input.runId);
      const linked = run.reportId
        ? await queryRows<{ publicId: string; body: unknown }>(
            tx,
            `SELECT "publicId",body FROM agent_reports WHERE "projectId"=$1 AND id=$2`,
            input.projectId,
            run.reportId,
          )
        : [];
      const linkedRow = linked[0];
      const linkedBody = modelPlaygroundReportSchema.safeParse(linkedRow?.body);
      if (run.reportId && !(linkedRow && linkedBody.success && linkedBody.data.runId === run.id)) {
        await refreshSavedModelReport(tx, input);
        return { ok: false, reason: "conflict" };
      }
      // The share lock is already held. A hold is not a backoff.
      // Held is the default for a linked report. Only a user save opts into alreadySaved.
      if (isProjectReadOnly(projects[0].writeMode)) {
        if (!linkedRow) return { ok: false, reason: "read_only" };
        if (options?.userSave)
          return { ok: true, reportId: linkedRow.publicId, alreadySaved: true };
        return { ok: false, reason: "held" };
      }
      if (recovery && !eligible) return { ok: false, reason: "backoff" };
      if (linkedRow) {
        await refreshSavedModelReport(tx, input);
        return { ok: true, reportId: linkedRow.publicId, alreadySaved: true };
      }
      if (!(await isStoredReportRunTerminal(tx, input))) return { ok: false, reason: "pending" };
      const results = run.columns.map(
        (column) =>
          column.result ?? { column: column.config, state: "unknown" as const, answer: null },
      );
      let body: ReturnType<typeof buildModelPlaygroundReport>;
      try {
        body = buildModelPlaygroundReport(run.id, run.snapshot.input, results, entities);
      } catch (error) {
        const reason = error instanceof ModelPlaygroundReportBudgetError ? "too_large" : "conflict";
        await recordReportFailure(tx, input, reason);
        return { ok: false, reason };
      }
      const parsed = agentReportSchema.safeParse({
        kind: "prompt_explorer",
        title: run.snapshot.input.prompt.slice(0, 160).replace(/[\uD800-\uDBFF]$/u, ""),
        body,
        provenance: { source: "model_playground", version: 1, runId: run.id },
      });
      if (!parsed.success) {
        await recordReportFailure(tx, input, "conflict");
        return { ok: false, reason: "conflict" };
      }
      const report = parsed.data;
      const id = randomUUID();
      const publicId = makePublicId("agr");
      await queryRows(
        tx,
        `INSERT INTO agent_reports(id,"publicId","projectId",kind,title,body,provenance,"createdById","createdAt") VALUES($1,$2,$3,'prompt_explorer',$4,$5::jsonb,$6::jsonb,$7,CURRENT_TIMESTAMP)`,
        id,
        publicId,
        input.projectId,
        report.title,
        JSON.stringify(report.body),
        JSON.stringify(report.provenance),
        run.actorId,
      );
      await queryRows(
        tx,
        `UPDATE model_playground_runs SET "reportId"=$3,"reportState"='saved',"reportFailure"=NULL,
          "reportAttemptedAt"=(clock_timestamp() AT TIME ZONE 'UTC') WHERE "projectId"=$1 AND id=$2`,
        input.projectId,
        input.runId,
        id,
      );
      return { ok: true, reportId: publicId, alreadySaved: false };
    });
  } catch {
    await recordReportRepairBackoff(db, input.runId);
    await recordReportStorageFailure(db, input);
    return { ok: false, reason: "storage" };
  }
}
