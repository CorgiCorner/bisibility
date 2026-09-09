import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { collectRankScheduleHeartbeat } from "./heartbeat-schedule-data";
import { createScheduleHeartbeatFixture } from "./heartbeat-schedule-data.postgres-fixtures";

vi.mock("server-only", () => ({}));
// The aggregate must use the injected local database, never a configured application database.
vi.mock("@/lib/db/prisma", () => ({ prisma: {} }));

const now = new Date("2026-09-09T14:00:00.000Z");
const cutoff = new Date("2026-09-09T13:45:00.000Z");
let fixture: Awaited<ReturnType<typeof createScheduleHeartbeatFixture>>;

beforeEach(async () => {
  fixture = await createScheduleHeartbeatFixture();
});

afterEach(async () => {
  await fixture.db.close();
});

function collect() {
  return collectRankScheduleHeartbeat(now, fixture.database as never);
}

describe("rank schedule heartbeat aggregate", () => {
  it("returns zero counts and a null oldest time without eligible members", async () => {
    await expect(collect()).resolves.toEqual({
      activeSchedules: 0,
      activeScheduledKeywords: 0,
      plannedOverdue: 0,
      oldestPlannedFor: null,
      tracked: 0,
    });
    expect(fixture.queries).toHaveLength(1);
  });

  it("counts current automatic membership once and keeps manual keywords tracked", async () => {
    await fixture.db.exec(`
      INSERT INTO check_schedules (id, "projectId", frequency, enabled, "archivedAt") VALUES
        ('weekly', 'project', 'weekly', true, NULL),
        ('monthly', 'project', 'monthly', true, NULL),
        ('cron', 'project', 'custom_cron', true, NULL),
        ('paused', 'project', 'paused', true, NULL),
        ('manual', 'project', 'manual', true, NULL),
        ('disabled', 'project', 'daily', false, NULL),
        ('archived', 'project', 'daily', true, '2026-09-01 06:00:00');
      INSERT INTO keywords (id, "projectId", "locationId", "checkScheduleId")
        SELECT 'keyword-' || id, 'project', 'active', id FROM check_schedules;
      INSERT INTO keywords (id, "projectId", "locationId", "checkScheduleId") VALUES
        ('second-daily', 'project', 'active', 'schedule'),
        ('unassigned', 'project', 'active', NULL);
      INSERT INTO rank_check_runs (id, "projectId", "checkScheduleId", "plannedFor")
        SELECT 'run-' || id, 'project', id, '2026-09-01 06:00:00'::timestamp(3)
        FROM check_schedules;
    `);

    await expect(collect()).resolves.toEqual({
      activeSchedules: 4,
      activeScheduledKeywords: 5,
      plannedOverdue: 4,
      oldestPlannedFor: "2026-09-01T06:00:00.000Z",
      tracked: 10,
    });
  });

  it("excludes archived keywords and inactive or foreign-project markets", async () => {
    await fixture.db.exec(`
      INSERT INTO projects (id, "ownerId") VALUES ('other-project', 'owner');
      INSERT INTO project_markets VALUES
        ('project', 'paused', 'paused'), ('project', 'removed', 'removed'),
        ('other-project', 'foreign-only', 'active');
      INSERT INTO keywords (id, "projectId", "locationId", "checkScheduleId", "archivedAt") VALUES
        ('live', 'project', 'active', 'schedule', NULL),
        ('paused-market', 'project', 'paused', 'schedule', NULL),
        ('removed-market', 'project', 'removed', 'schedule', NULL),
        ('missing-market', 'project', 'missing', 'schedule', NULL),
        ('foreign-market', 'project', 'foreign-only', 'schedule', NULL),
        ('archived-keyword', 'project', 'active', 'schedule', '2026-09-01 06:00:00');
    `);

    await expect(collect()).resolves.toMatchObject({
      activeSchedules: 1,
      activeScheduledKeywords: 1,
      tracked: 1,
    });
  });

  it("excludes sample, deactivated-owner and read-only project expectations", async () => {
    await fixture.db.exec(`
      INSERT INTO users VALUES ('deactivated', '2026-09-01 06:00:00');
      INSERT INTO projects (id, "ownerId", "writeMode", "isSample") VALUES
        ('sample', 'owner', 'active', true),
        ('deactivated-project', 'deactivated', 'active', false),
        ('read-only', 'owner', 'migration_hold', false);
      INSERT INTO project_markets
        SELECT id, 'active', 'active'::"ProjectMarketStatus" FROM projects WHERE id <> 'project';
      INSERT INTO check_schedules (id, "projectId")
        SELECT 'schedule-' || id, id FROM projects WHERE id <> 'project';
      INSERT INTO keywords (id, "projectId", "locationId", "checkScheduleId")
        SELECT 'keyword-' || id, "projectId", 'active', id FROM check_schedules;
      INSERT INTO rank_check_runs (id, "projectId", "checkScheduleId", "plannedFor")
        SELECT 'run-' || id, "projectId", id, '2026-09-01 06:00:00'::timestamp(3)
        FROM check_schedules;
    `);

    await expect(collect()).resolves.toEqual({
      activeSchedules: 1,
      activeScheduledKeywords: 1,
      plannedOverdue: 1,
      oldestPlannedFor: "2026-09-01T06:00:00.000Z",
      tracked: 1,
    });
  });

  it("counts only persisted scheduled planned runs beyond the strict 15-minute grace", async () => {
    await fixture.db.exec(`
      INSERT INTO keywords (id, "projectId", "locationId", "checkScheduleId") VALUES
        ('first', 'project', 'active', 'schedule'), ('second', 'project', 'active', 'schedule');
      INSERT INTO projects (id, "ownerId") VALUES ('other-project', 'owner');
      INSERT INTO rank_check_runs
        (id, "projectId", "checkScheduleId", trigger, "selectionKind", status, "plannedFor") VALUES
        ('oldest', 'project', 'schedule', 'scheduled', 'scheduled_due', 'planned', '2026-09-01 06:00:00'),
        ('overdue', 'project', 'schedule', 'scheduled', 'scheduled_due', 'planned', '2026-09-09 13:30:00'),
        ('just-overdue', 'project', 'schedule', 'scheduled', 'scheduled_due', 'planned', '2026-09-09 13:44:59.999'),
        ('at-cutoff', 'project', 'schedule', 'scheduled', 'scheduled_due', 'planned', '2026-09-09 13:45:00'),
        ('recent', 'project', 'schedule', 'scheduled', 'scheduled_due', 'planned', '2026-09-09 13:59:00'),
        ('future', 'project', 'schedule', 'scheduled', 'scheduled_due', 'planned', '2026-09-10 06:00:00'),
        ('null-time', 'project', 'schedule', 'scheduled', 'scheduled_due', 'planned', NULL),
        ('blocked', 'project', 'schedule', 'scheduled', 'scheduled_due', 'blocked', '2026-08-01 06:00:00'),
        ('completed', 'project', 'schedule', 'scheduled', 'scheduled_due', 'completed', '2026-08-01 06:00:00'),
        ('queued', 'project', 'schedule', 'scheduled', 'scheduled_due', 'queued', '2026-08-01 06:00:00'),
        ('manual', 'project', 'schedule', 'manual', 'scheduled_due', 'planned', '2026-08-01 06:00:00'),
        ('legacy', 'project', 'schedule', 'scheduled', 'legacy_schedule', 'planned', '2026-08-01 06:00:00'),
        ('foreign-project', 'other-project', 'schedule', 'scheduled', 'scheduled_due', 'planned', '2026-08-01 06:00:00'),
        ('no-schedule', 'project', NULL, 'scheduled', 'scheduled_due', 'planned', '2026-08-01 06:00:00');
    `);

    await expect(collect()).resolves.toEqual({
      activeSchedules: 1,
      activeScheduledKeywords: 2,
      plannedOverdue: 3,
      oldestPlannedFor: "2026-09-01T06:00:00.000Z",
      tracked: 2,
    });
    expect(fixture.queries).toHaveLength(1);
    expect(fixture.queries[0]?.text).toContain("::timestamp(3)");
    expect(fixture.queries[0]?.values).toContainEqual(cutoff);
  });

  it("excludes historical plans when their schedule loses its last eligible member", async () => {
    await fixture.db.exec(`
      INSERT INTO keywords (id, "projectId", "locationId", "checkScheduleId")
        VALUES ('keyword', 'project', 'active', 'schedule');
      INSERT INTO rank_check_runs (id, "projectId", "checkScheduleId", "plannedFor")
        VALUES ('run', 'project', 'schedule', '2026-09-01 06:00:00');
    `);
    await expect(collect()).resolves.toMatchObject({ plannedOverdue: 1 });

    await fixture.db.exec("UPDATE project_markets SET status = 'paused';");

    await expect(collect()).resolves.toEqual({
      activeSchedules: 0,
      activeScheduledKeywords: 0,
      plannedOverdue: 0,
      oldestPlannedFor: null,
      tracked: 0,
    });
  });

  it("does not treat a cross-project schedule link as active membership", async () => {
    await fixture.db.exec(`
      INSERT INTO projects (id, "ownerId") VALUES ('other-project', 'owner');
      INSERT INTO check_schedules (id, "projectId") VALUES ('foreign-schedule', 'other-project');
      INSERT INTO keywords (id, "projectId", "locationId", "checkScheduleId")
        VALUES ('keyword', 'project', 'active', 'foreign-schedule');
      INSERT INTO rank_check_runs (id, "projectId", "checkScheduleId", "plannedFor")
        VALUES ('run', 'other-project', 'foreign-schedule', '2026-09-01 06:00:00');
    `);

    await expect(collect()).resolves.toEqual({
      activeSchedules: 0,
      activeScheduledKeywords: 0,
      plannedOverdue: 0,
      oldestPlannedFor: null,
      tracked: 1,
    });
  });
});
