import { describe, expect, it } from "vitest";
import { buildHeartbeatEvent, type HeartbeatEventInput } from "./heartbeat-format";

function input(): HeartbeatEventInput {
  return {
    database: {
      bootstrapErrors: [],
      collectionAvailable: true,
      dispatch: {
        expiredClaims: 0,
        oldestExpiredClaimAt: null,
        overdueQueued: 0,
        oldestOverdueQueuedAt: null,
      },
      rank: {
        deferred: 0,
        failed: 0,
        lagP50Ms: null,
        lagP95Ms: null,
        scheduled: 0,
        stuck: 0,
        succeeded: 0,
        topFailures: [],
      },
      schedule: {
        activeSchedules: 1,
        activeScheduledKeywords: 1,
        plannedOverdue: 0,
        oldestPlannedFor: null,
        tracked: 1,
      },
      traffic: [],
      undeliveredEvents: 0,
    },
    now: new Date("2026-09-09T12:00:00Z"),
    temporalCounterState: { status: "available", totals: { missedCatchup: 0, skippedOverlap: 0 } },
    schedulesEnabled: {},
    suppressed: {},
    sweep: { attempted: 0, delivered: 0 },
    temporal: {
      inspectionErrors: 0,
      issueSchedules: [],
      missedCatchupTotal: 0,
      nextActionAt: null,
      recentActions: 107,
      scheduleIssues: [],
      schedules: 3,
      skippedOverlapTotal: 0,
    },
    workerStartedAt: new Date("2026-09-09T11:00:00Z"),
  };
}

describe("dispatch health is independent of worker liveness and check outcomes", () => {
  it("warns about an expired claim even when the live worker has no failed checks", () => {
    const fixture = input();
    fixture.database.dispatch = {
      expiredClaims: 1,
      oldestExpiredClaimAt: "2026-09-09T10:00:00Z",
      overdueQueued: 2,
      oldestOverdueQueuedAt: "2026-09-09T11:00:00Z",
    };
    const event = buildHeartbeatEvent(fixture);
    expect(event.severity).toBe("warning");
    expect(event.fields?.["Rank dispatch"]).toContain("1 expired unlinked claim");
    expect(event.fields?.["Rank dispatch"]).toContain("oldest 2.0 h ago");
    expect(event.fields?.["Rank dispatch"]).toContain("2 overdue queued targets");
    expect(event.fields?.Worker).toContain("up 1.0 h");
    expect(event.fields?.["Rank checks (24h)"]).toContain("failed 0");
    expect(JSON.stringify(event)).not.toMatch(
      /all healthy|no failures|dispatcher failed|SQL failure/i,
    );
    expect(event.fields?.["Needs attention"]).toContain("inspect dispatcher history");
  });

  it("reports recovery without treating ordinary future queued work as a failure", () => {
    const event = buildHeartbeatEvent(input());
    expect(event.severity).toBe("info");
    expect(event.fields?.["Rank dispatch"]).toContain("0 expired unlinked claims");
    expect(event.fields?.["Rank dispatch"]).toContain("0 overdue queued targets");
    expect(event.fields?.["Rank schedules"]).toContain("1 active schedule");
    expect(event.fields).not.toHaveProperty("Needs attention");
  });

  it("never represents unavailable dispatch collection as zero backlog", () => {
    const fixture = input();
    fixture.database.dispatch = null;
    const event = buildHeartbeatEvent(fixture);
    expect(event.severity).toBe("warning");
    expect(event.fields?.["Rank dispatch"]).toBe("Unavailable - backlog was not evaluated");
    expect(event.title).not.toContain("all healthy");
  });

  it("labels retained schedule history as sampled and no future schedule explicitly", () => {
    const event = buildHeartbeatEvent(input());
    expect(event.fields?.Schedules).toContain("107 sampled actions in 24 h");
    expect(event.fields?.Schedules).toContain("no upcoming active action");
  });

  it("does not label failed database collection as zero outcomes or a clear outbox", () => {
    const fixture = input();
    fixture.database.collectionAvailable = false;
    fixture.database.bootstrapErrors = ["Database heartbeat collection failed."];
    fixture.database.dispatch = null;
    const event = buildHeartbeatEvent(fixture);
    expect(event.fields?.["Rank checks (24h)"]).toContain("Unavailable");
    expect(event.fields?.["Rank schedules"]).toContain("Unavailable");
    expect(event.fields?.Traffic).toContain("Unavailable");
    expect(event.fields?.Collection).toBe("Unavailable - database collection failed");
    expect(event.fields?.["Needs attention"]).toContain("Database collection failed");
    expect(JSON.stringify(event)).not.toContain("outbox clear");
  });

  it("warns on persisted overdue planned runs, without reconstructing legacy keyword due times", () => {
    const fixture = input();
    fixture.database.schedule.plannedOverdue = 1;
    fixture.database.schedule.oldestPlannedFor = "2026-09-09T10:00:00Z";
    const event = buildHeartbeatEvent(fixture);
    expect(event.severity).toBe("warning");
    expect(event.fields?.["Needs attention"]).toContain("1 planned run past the 15 min grace");
    expect(JSON.stringify(event)).not.toContain("reconciler");
  });

  it("keeps overlap counters separate from dispatch backlog evidence", () => {
    const fixture = input();
    fixture.temporal.skippedOverlapTotal = 16;
    const event = buildHeartbeatEvent(fixture);
    expect(event.severity).toBe("warning");
    expect(event.fields?.["Needs attention"]).toContain("16 new skipped overlap");
    expect(event.fields?.["Rank dispatch"]).toContain("0 expired unlinked claims");
    expect(JSON.stringify(event)).not.toMatch(/SQL failure|dispatcher failed|outage/i);
  });
});
