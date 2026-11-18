import { readFile } from "node:fs/promises";
import { makePublicId } from "@/lib/db/public-id-resources";
import { expect, test, vi } from "vitest";
import { historyHarness } from "./history.test-support";
import { saveModelPlaygroundReport } from "./report";
import { buildModelPlaygroundReport } from "./report-body";
import { recoverModelPlaygroundReports } from "./report-recovery";

vi.mock("./report-context", () => ({ loadModelReportEntities: async () => [] }));
vi.mock("./database", () => ({
  modelPlaygroundDatabase: {
    $transaction: () => {
      throw new Error("Only fixture database");
    },
  },
}));
const h = historyHarness();

test("migration preserves ambiguous old deletions and permits explicit recovery of an old missed save", async () => {
  await h.db.exec(`DROP TRIGGER model_playground_report_bookkeeping ON model_playground_runs;
    DROP FUNCTION guard_model_playground_report_bookkeeping();
    DROP INDEX model_playground_report_recovery_idx;
    ALTER TABLE model_playground_runs DROP CONSTRAINT model_playground_report_bookkeeping,
      DROP COLUMN "reportState",DROP COLUMN "reportAttemptedAt",DROP COLUMN "reportFailure";`);
  const oldSave = async () => {
    const run = await h.launch();
    const retained = await h.store.read("project-a", run.id);
    const body = buildModelPlaygroundReport(
      run.id,
      run.snapshot.input,
      retained.columns.map((c) => {
        if (!c.result) throw new Error("Expected result");
        return c.result;
      }),
      [],
    );
    const id = crypto.randomUUID();
    await h.db.query(
      `INSERT INTO agent_reports(id,"publicId","projectId",kind,title,body) VALUES($1,$2,'project-a','prompt_explorer','Fixture',$3::jsonb)`,
      [id, makePublicId("agr"), JSON.stringify(body)],
    );
    await h.store.attachReport("project-a", run.id, id);
    return { run, id };
  };
  const deleted = await oldSave();
  await h.db.query(`DELETE FROM agent_reports WHERE id=$1`, [deleted.id]);
  const missed = await h.launch();
  const linked = await oldSave();
  await h.db.exec(
    await readFile(
      new URL(
        "../../prisma/migrations/20261113210000_model_playground_report_recovery/migration.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  await h.db.exec(
    await readFile(
      new URL(
        "../../prisma/migrations/20261113220000_model_playground_report_refresh/migration.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  const states = (
    await h.db.query<{ id: string; reportState: string }>(
      `SELECT id,"reportState" FROM model_playground_runs`,
    )
  ).rows;
  expect(states.find((r) => r.id === deleted.run.id)?.reportState).toBe("unclassified");
  expect(states.find((r) => r.id === missed.id)?.reportState).toBe("unclassified");
  expect(states.find((r) => r.id === linked.run.id)?.reportState).toBe("saved");
  expect(await recoverModelPlaygroundReports(h.database)).toMatchObject({ ok: true, attempted: 0 });
  expect(
    (
      await saveModelPlaygroundReport(
        h.database,
        { projectId: "project-a", runId: missed.id },
        [],
        false,
        true,
      )
    ).ok,
  ).toBe(true);
  expect(
    (await h.db.query(`SELECT id FROM agent_reports WHERE id=$1`, [deleted.id])).rows,
  ).toHaveLength(0);
  const fresh = await h.launch();
  expect(await recoverModelPlaygroundReports(h.database)).toMatchObject({
    ok: true,
    attempted: 0,
  });
  expect(
    (await saveModelPlaygroundReport(h.database, { projectId: "project-a", runId: fresh.id }, []))
      .ok,
  ).toBe(true);
  expect((await h.store.read("project-a", fresh.id)).reportId).toBeTruthy();
});
