import { createClaimFixture, publicId } from "@/lib/rank-check/items-claim.postgres-fixtures";
import { afterEach, describe, expect, it, vi } from "vitest";
import { reconcilePlannedRunsForSchedule } from "./reconcile-schedule";

vi.mock("@/lib/notifications/realtime", () => ({ publishOperationChanged: vi.fn() }));
const closing: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closing.splice(0)) await close();
});

async function fixture() {
  const f = await createClaimFixture();
  closing.push(() => f.db.close());
  await f.db.exec(`
    ALTER TABLE keywords ADD COLUMN "checkScheduleId" text;
    ALTER TABLE rank_check_runs ADD COLUMN "checkScheduleId" text;
    ALTER TABLE rank_check_runs ADD COLUMN "selectionSpec" jsonb;
    ALTER TABLE rank_check_runs ADD COLUMN "plannedFor" timestamp(3);
    CREATE TABLE project_defaults ("projectId" text, timezone text);
    CREATE TABLE check_schedules (id text, "projectId" text, "publicId" text, "archivedAt" timestamp(3), enabled boolean,
      frequency text, "cronExpression" text, "timeOfDay" text, "jitterMinutes" integer, timezone text);
    INSERT INTO projects VALUES ('project', 'example.com');
    INSERT INTO project_defaults VALUES ('project', 'UTC');
    INSERT INTO check_schedules VALUES ('old', 'project', '${publicId("sch", "old")}', NULL, true, 'weekly', NULL, NULL, 0, 'UTC');
    INSERT INTO keywords (id,"publicId","projectId","locationId",device,"checkScheduleId") VALUES
      ('moved', '${publicId("kw", "moved")}', 'project', 'market', 'desktop', 'daily'),
      ('stays', '${publicId("kw", "stays")}', 'project', 'market', 'desktop', 'old');
    INSERT INTO rank_check_runs (id,"publicId","projectId","requestedCount","selectionKind",trigger,status,"checkScheduleId","selectionSpec","plannedFor")
      VALUES ('run', '${publicId("rcr", "old")}', 'project', 2, 'scheduled_due', 'scheduled', 'queued', 'old',
        '{"occurrenceKey":"2026-09-06"}', '2026-09-06 00:00:00');
    INSERT INTO rank_check_run_items (id,"runId","keywordId",status,"notBefore") VALUES
      ('moved-item', 'run', 'moved', 'queued', '2026-09-08 12:00:00'),
      ('stays-item', 'run', 'stays', 'queued', '2026-09-08 13:00:00');
  `);
  // Queue selection/cancellation/finalization execute real SQL; this suite has no unmaterialized runs.
  const tx = { ...f.tx, checkSchedule: { findUnique: vi.fn(async () => null) } };
  return { ...f, tx };
}

describe("scheduled queue reconciliation SQL", () => {
  it("cancels only the moved target, retaining its receipt and the other queued keyword", async () => {
    const f = await fixture();
    await reconcilePlannedRunsForSchedule("old", f.tx as never);
    expect(
      await f.query(
        'SELECT id,status,"actualCostCents","blockedReason" FROM rank_check_run_items ORDER BY id',
      ),
    ).toEqual([
      {
        id: "moved-item",
        status: "cancelled",
        actualCostCents: 0,
        blockedReason: "schedule_changed",
      },
      { id: "stays-item", status: "queued", actualCostCents: null, blockedReason: null },
    ]);
    expect(await f.query('SELECT status,"cancelledCount" FROM rank_check_runs')).toEqual([
      { status: "queued", cancelledCount: 1 },
    ]);
    expect(f.audits).toHaveLength(1);
  });

  it.each(["manual", "claimed", "linked"])(
    "preserves %s work after membership changes",
    async (kind) => {
      const f = await fixture();
      if (kind === "manual") await f.db.exec("UPDATE rank_check_runs SET trigger='manual'");
      if (kind === "claimed")
        await f.db.exec("UPDATE rank_check_run_items SET status='running' WHERE id='moved-item'");
      if (kind === "linked")
        await f.db.exec(
          "UPDATE rank_check_run_items SET status='running',\"rankCheckId\"='paid' WHERE id='moved-item'",
        );
      await reconcilePlannedRunsForSchedule("old", f.tx as never);
      expect(
        await f.query("SELECT status FROM rank_check_run_items WHERE id=$1", ["moved-item"]),
      ).toEqual([{ status: kind === "manual" ? "queued" : "running" }]);
      expect(f.audits).toHaveLength(0);
    },
  );

  it.each(["disable", "delete", "cadence"])(
    "retires unstarted items after schedule %s and preserves history",
    async (change) => {
      const f = await fixture();
      if (change === "disable") await f.db.exec("UPDATE check_schedules SET enabled=false");
      await reconcilePlannedRunsForSchedule("old", f.tx as never, {
        deleting: change === "delete",
        invalidateMaterialized: change === "cadence",
      });
      expect(
        await f.query('SELECT status,"costCents","cancelledCount" FROM rank_check_runs'),
      ).toEqual([{ status: "cancelled", costCents: 0, cancelledCount: 2 }]);
      expect(await f.query("SELECT COUNT(*)::int AS count FROM rank_check_run_items")).toEqual([
        { count: 2 },
      ]);
      expect(f.audits).toHaveLength(2);
    },
  );

  it("does not cancel an item if a concurrent claim has already won", async () => {
    const f = await fixture();
    const query = f.tx.$queryRaw;
    f.tx.$queryRaw = async (sql) => {
      const rows = await query(sql);
      await f.db.exec("UPDATE rank_check_run_items SET status='running' WHERE id='moved-item'");
      return rows;
    };
    await reconcilePlannedRunsForSchedule("old", f.tx as never);
    expect(
      await f.query("SELECT status FROM rank_check_run_items WHERE id=$1", ["moved-item"]),
    ).toEqual([{ status: "running" }]);
    expect(f.audits).toHaveLength(0);
  });
});
