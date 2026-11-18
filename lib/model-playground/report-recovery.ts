import "server-only";
import { z } from "zod";
import { reportRecoveryEligibleSql } from "./report-bookkeeping";
import { finalizeModelPlaygroundReport } from "./report-finalize";
import { reportColumnPendingSql } from "./report-readiness";
import { type ModelPlaygroundDatabase, queryRows, storeTransaction } from "./store-db";

const cursorSchema = z.object({ createdAt: z.iso.datetime(), id: z.uuid() }).strict();
const optionsSchema = z
  .object({
    limit: z.number().int().min(1).max(100).default(50),
    after: cursorSchema.optional(),
  })
  .strict();
type Cursor = z.infer<typeof cursorSchema>;
export type ReportRecoveryResult =
  | { ok: true; attempted: number; saved: number; failed: number; next: Cursor | null }
  | { ok: false; reason: "invalid_input" | "storage" };

/** Repairs saved_stale storage and retries failed storage creation. It does not create a none row or refresh a current saved report. */
export async function recoverModelPlaygroundReports(
  db: ModelPlaygroundDatabase,
  options: unknown = {},
): Promise<ReportRecoveryResult> {
  const parsed = optionsSchema.safeParse(options);
  if (!parsed.success) return { ok: false, reason: "invalid_input" };
  const { limit, after } = parsed.data;
  try {
    const runs = await storeTransaction(db, (tx) =>
      queryRows<{ id: string; createdAt: string }>(
        tx,
        `SELECT r.id,to_char(r."createdAt",'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "createdAt" FROM model_playground_runs r JOIN projects p ON p.id=r."projectId"
      WHERE (r."reportState"='saved_stale' OR (r."reportState"='failed' AND r."reportFailure"='storage'))
        AND ${reportRecoveryEligibleSql} AND p."writeMode"='active'
        AND EXISTS (SELECT 1 FROM model_playground_columns c WHERE c."runId"=r.id AND c."projectId"=r."projectId")
        AND NOT EXISTS (SELECT 1 FROM model_playground_columns c WHERE c."runId"=r.id AND c."projectId"=r."projectId" AND ${reportColumnPendingSql})
        AND ($1::timestamp IS NULL OR (r."createdAt",r.id)>($1::timestamp,$2::text))
      ORDER BY r."createdAt",r.id LIMIT $3`,
        after?.createdAt ?? null,
        after?.id ?? null,
        limit,
      ),
    );
    let saved = 0;
    for (const run of runs) {
      try {
        if ((await finalizeModelPlaygroundReport(run.id, db, true)).ok) {
          const [custody] = await storeTransaction(db, (tx) =>
            queryRows<{ reportState: string }>(
              tx,
              `SELECT "reportState" FROM model_playground_runs WHERE id=$1`,
              run.id,
            ),
          );
          if (custody?.reportState === "saved") saved++;
        }
      } catch {
        /* One run cannot prevent recovery of later runs. */
      }
    }
    const last = runs.at(-1);
    return {
      ok: true,
      attempted: runs.length,
      saved,
      failed: runs.length - saved,
      next: runs.length === limit && last ? { id: last.id, createdAt: last.createdAt } : null,
    };
  } catch {
    return { ok: false, reason: "storage" };
  }
}
