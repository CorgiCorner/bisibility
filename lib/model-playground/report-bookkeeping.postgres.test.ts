import { expect, test } from "vitest";
import { historyHarness } from "./history.test-support";
import { saveModelPlaygroundReport } from "./report";
import { reportBookkeepingSchema } from "./report-bookkeeping";

const h = historyHarness();
const now = new Date();
const cases = [
  {
    reportState: "none",
    reportId: null,
    reportAttemptedAt: null,
    reportFailure: null,
    valid: true,
  },
  {
    reportState: "unclassified",
    reportId: null,
    reportAttemptedAt: null,
    reportFailure: null,
    valid: true,
  },
  {
    reportState: "unclassified",
    reportId: null,
    reportAttemptedAt: now,
    reportFailure: null,
    valid: false,
  },
  {
    reportState: "failed",
    reportId: null,
    reportAttemptedAt: now,
    reportFailure: "storage",
    valid: true,
  },
  {
    reportState: "failed",
    reportId: null,
    reportAttemptedAt: now,
    reportFailure: "conflict",
    valid: true,
  },
  {
    reportState: "failed",
    reportId: null,
    reportAttemptedAt: now,
    reportFailure: "too_large",
    valid: true,
  },
  {
    reportState: "dismissed",
    reportId: null,
    reportAttemptedAt: now,
    reportFailure: null,
    valid: true,
  },
  {
    reportState: "dismissed",
    reportId: null,
    reportAttemptedAt: null,
    reportFailure: null,
    valid: true,
  },
  {
    reportState: "other",
    reportId: null,
    reportAttemptedAt: null,
    reportFailure: null,
    valid: false,
  },
  {
    reportState: "none",
    reportId: null,
    reportAttemptedAt: now,
    reportFailure: null,
    valid: false,
  },
  {
    reportState: "failed",
    reportId: null,
    reportAttemptedAt: null,
    reportFailure: "storage",
    valid: false,
  },
  {
    reportState: "failed",
    reportId: null,
    reportAttemptedAt: now,
    reportFailure: null,
    valid: false,
  },
  {
    reportState: "failed",
    reportId: null,
    reportAttemptedAt: now,
    reportFailure: "invalid",
    valid: false,
  },
  {
    reportState: "saved",
    reportId: null,
    reportAttemptedAt: now,
    reportFailure: null,
    valid: false,
  },
  {
    reportState: "dismissed",
    reportId: null,
    reportAttemptedAt: null,
    reportFailure: "storage",
    valid: false,
  },
];
test.each(cases)(
  "stored report schema and SQL agree: $reportState / $reportFailure / $reportAttemptedAt",
  async ({ valid, ...row }) => {
    const run = await h.launch();
    expect(reportBookkeepingSchema.safeParse(row).success).toBe(valid);
    const write = h.db.query(
      `UPDATE model_playground_runs SET "reportState"=$2,"reportId"=$3,"reportAttemptedAt"=$4,"reportFailure"=$5 WHERE id=$1`,
      [run.id, row.reportState, row.reportId, row.reportAttemptedAt, row.reportFailure],
    );
    if (valid) await write;
    else await expect(write).rejects.toThrow();
    for (const key of Object.keys(row)) {
      const absent = { ...row } as Record<string, unknown>;
      delete absent[key];
      expect(reportBookkeepingSchema.safeParse(absent).success).toBe(false);
    }
  },
);

test("save atomically records saved and deletion permanently tombstones custody", async () => {
  const run = await h.launch();
  await saveModelPlaygroundReport(h.database, { projectId: "project-a", runId: run.id }, []);
  const select = async () =>
    (
      await h.db.query(
        `SELECT "reportState","reportId","reportAttemptedAt","reportFailure" FROM model_playground_runs WHERE id=$1`,
        [run.id],
      )
    ).rows[0];
  const saved = await select();
  expect(saved).toMatchObject({
    reportState: "saved",
    reportId: expect.any(String),
    reportAttemptedAt: expect.any(Date),
    reportFailure: null,
  });
  expect(reportBookkeepingSchema.safeParse(saved).success).toBe(true);
  await h.db.exec(`DELETE FROM agent_reports`);
  const dismissed = await select();
  expect(dismissed).toMatchObject({
    reportState: "dismissed",
    reportId: null,
    reportFailure: null,
  });
  expect(reportBookkeepingSchema.safeParse(dismissed).success).toBe(true);
  await expect(
    h.db.query(
      `UPDATE model_playground_runs SET "reportState"='none',"reportAttemptedAt"=NULL WHERE id=$1`,
      [run.id],
    ),
  ).rejects.toThrow("dismissed");
});

test.each(["infinity", "-infinity"])(
  "rejects non-finite %s failure attempt times in SQL and the stored contract",
  async (timing) => {
    const run = await h.launch();
    expect(
      reportBookkeepingSchema.safeParse({
        reportState: "failed",
        reportId: null,
        reportAttemptedAt: timing === "infinity" ? Infinity : -Infinity,
        reportFailure: "storage",
      }).success,
    ).toBe(false);
    await expect(
      h.db.query(
        `UPDATE model_playground_runs SET "reportState"='failed',"reportFailure"='storage',"reportAttemptedAt"=$2::timestamp WHERE id=$1`,
        [run.id, timing],
      ),
    ).rejects.toThrow();
    await h.db.query(
      `UPDATE model_playground_runs SET "reportState"='failed',"reportFailure"='storage',"reportAttemptedAt"=(clock_timestamp() AT TIME ZONE 'UTC') WHERE id=$1`,
      [run.id],
    );
    const [row] = (
      await h.db.query(
        `SELECT "reportState","reportId","reportAttemptedAt","reportFailure" FROM model_playground_runs WHERE id=$1`,
        [run.id],
      )
    ).rows;
    expect(reportBookkeepingSchema.safeParse(row).success).toBe(true);
  },
);

test.each([
  ["saved", null, true],
  ["saved", "storage", false],
  ["saved_stale", "storage", true],
  ["saved_stale", "too_large", true],
  ["saved_stale", "conflict", true],
  ["saved_stale", null, false],
  ["saved_stale", "other", false],
  ["failed", "storage", false],
  ["none", null, false],
] as const)("linked custody schema and SQL agree: %s / %s", async (state, failure, valid) => {
  const run = await h.launch();
  await saveModelPlaygroundReport(h.database, { projectId: "project-a", runId: run.id }, []);
  const reportId = (await h.store.read("project-a", run.id)).reportId;
  const row = {
    reportState: state,
    reportId,
    reportFailure: failure,
    reportAttemptedAt: new Date(),
  };
  expect(reportBookkeepingSchema.safeParse(row).success).toBe(valid);
  const write = h.db.query(
    `UPDATE model_playground_runs SET "reportState"=$2,"reportFailure"=$3 WHERE id=$1`,
    [run.id, state, failure],
  );
  if (valid) await write;
  else await expect(write).rejects.toThrow();
  for (const key of Object.keys(row)) {
    const absent: Record<string, unknown> = { ...row };
    delete absent[key];
    expect(reportBookkeepingSchema.safeParse(absent).success).toBe(false);
  }
  expect(reportBookkeepingSchema.safeParse({ ...row, reportAttemptedAt: null }).success).toBe(
    false,
  );
});
