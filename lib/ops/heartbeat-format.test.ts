import { afterEach, describe, expect, it, vi } from "vitest";
import { buildHeartbeatEvent, type HeartbeatEventInput } from "./heartbeat-format";
import { formatOpsSlackPayload } from "./slack";

const now = new Date("2026-07-17T12:00:00.000Z");

function healthyInput(): HeartbeatEventInput {
  return {
    database: {
      bootstrapErrors: [],
      rank: {
        deferred: 0,
        failed: 0,
        lagP50Ms: null,
        lagP95Ms: null,
        scheduled: 1,
        stuck: 0,
        succeeded: 1,
        topFailures: [],
      },
      schedule: { active: 1, dueWithoutRun: 0, tracked: 1 },
      traffic: [
        {
          latestSuccessAt: "2026-07-17T10:00:00.000Z",
          project: "project_1",
          provider: "gsc",
          rowsFetched: 10,
          rowsMatched: 8,
          rowsUpserted: 8,
          status: "succeeded_with_data",
        },
      ],
      undeliveredEvents: 0,
    },
    now,
    temporalCounterState: {
      status: "available",
      totals: { missedCatchup: 0, skippedOverlap: 0 },
    },
    schedulesEnabled: { "maintenance-traffic-sync": true },
    suppressed: {},
    sweep: { attempted: 0, delivered: 0 },
    temporal: {
      inspectionErrors: 0,
      issueSchedules: [],
      missedCatchupTotal: 0,
      nextActionAt: "2026-07-18T10:00:00.000Z",
      recentActions: 8,
      scheduleIssues: [],
      schedules: 8,
      skippedOverlapTotal: 0,
    },
    workerStartedAt: new Date("2026-07-17T02:24:00.000Z"),
  };
}

function attentionLines(event: ReturnType<typeof buildHeartbeatEvent>) {
  const attention = event.fields?.["Needs attention"];
  return typeof attention === "string" ? attention.split("\n") : [];
}

function expectSafeRenderedDigest(event: ReturnType<typeof buildHeartbeatEvent>) {
  const rendered = JSON.stringify(formatOpsSlackPayload(event));
  expect(rendered).not.toContain("None");
  expect(rendered).not.toMatch(/\b[0-9a-f]{40}\b/i);
  expect(rendered).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
}

describe("heartbeat Slack digest", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("renders an all-healthy verdict without attention, transient, or duplicate footer fields", () => {
    vi.stubEnv("APP_VERSION", "0123456789abcdef0123456789abcdef01234567");
    vi.stubEnv("SITE_URL", "https://bisibility.test/");
    vi.stubEnv("TEMPORAL_UI_URL", "https://temporal.test");

    const event = buildHeartbeatEvent(healthyInput());

    expect(event).toMatchInlineSnapshot(`
      {
        "fields": {
          "Healthy": "worker up 9.6 h · ops outbox clear · rank checks: no failures · no bootstrap errors",
          "Rank checks (24h)": "Scheduled 1 · succeeded 1 · failed 0 · deferred 0 · stuck 0",
          "Schedules": "8 inspected · 8 actions in 24 h · next in 22.0 h",
          "Traffic": "GSC ok 1 · stale 0 · failed 0 · not run 0",
        },
        "kind": "heartbeat",
        "severity": "info",
        "title": "bisibility daily digest - all healthy",
      }
    `);
    expect(event.fields).not.toHaveProperty("Needs attention");
    expect(event.fields).not.toHaveProperty("Transient");
    expect(event.fields).not.toHaveProperty("Runtime and links");
    const payload = formatOpsSlackPayload(event);
    expect(payload.blocks.filter((block) => block.type === "context")).toHaveLength(1);
    expect(JSON.stringify(payload)).toContain("0123456789ab");
    expectSafeRenderedDigest(event);
  });

  it("does not suggest configuring a schedule when an active schedule exists but was not due", () => {
    const input = healthyInput();
    input.now = new Date("2026-07-19T06:00:00.000Z");
    input.database.rank = { ...input.database.rank, scheduled: 0, succeeded: 0 };
    input.database.schedule = { active: 1, dueWithoutRun: 0, tracked: 1 };

    const event = buildHeartbeatEvent(input);

    expect(attentionLines(event).join(" ")).not.toContain("automatic keyword schedule");
    expect(event.severity).toBe("info");
  });

  it("puts traffic never-run and missing schedule intent first with actionable causes", () => {
    const input = healthyInput();
    input.schedulesEnabled["maintenance-traffic-sync"] = false;
    input.database.rank = {
      ...input.database.rank,
      scheduled: 0,
      succeeded: 1,
    };
    input.database.schedule = { active: 0, dueWithoutRun: 0, tracked: 1 };
    input.database.traffic = ["gsc", "ga4", "plausible"].map((provider, index) => ({
      latestSuccessAt: null,
      project: `project_${index + 1}`,
      provider,
      rowsFetched: 0,
      rowsMatched: 0,
      rowsUpserted: 0,
      status: "not_run",
    }));

    const event = buildHeartbeatEvent(input);
    const lines = attentionLines(event);

    expect(event.title).toBe("bisibility daily digest - 2 warnings");
    expect(event.severity).toBe("warning");
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain(
      "schedule disabled (TRAFFIC_SYNC_SCHEDULE_ENABLED unset); enable it on the worker",
    );
    expect(lines[1]).toContain("no automatic schedule is active");
    expect(lines[1]).toContain("Set an automatic keyword schedule");
    expectSafeRenderedDigest(event);
  });

  it("raises an error when an active schedule became due without a scheduled run", () => {
    const input = healthyInput();
    input.database.rank = { ...input.database.rank, scheduled: 0, succeeded: 0 };
    input.database.schedule = { active: 1, dueWithoutRun: 1, tracked: 1 };

    const event = buildHeartbeatEvent(input);

    expect(event.severity).toBe("error");
    expect(attentionLines(event)).toEqual([
      expect.stringContaining("became due in 24 h but no scheduled run executed"),
    ]);
  });

  it("scopes the no-failure health copy to rank checks when traffic failed", () => {
    const input = healthyInput();
    const traffic = input.database.traffic[0];
    expect(traffic).toBeDefined();
    if (!traffic) return;
    input.database.traffic[0] = { ...traffic, errorClass: "provider_5xx", status: "failed" };

    const event = buildHeartbeatEvent(input);

    expect(event.fields?.Healthy).toContain("rank checks: no failures");
    expect(event.fields?.Healthy).not.toMatch(/(?:^| · )no failures(?: · |$)/);
    expect(event.fields?.Traffic).toContain("class provider_5xx");
    expect(event.severity).toBe("error");
  });

  it("identifies a never-successful config_invalid GA4 connection without escalating", () => {
    const input = healthyInput();
    const traffic = input.database.traffic[0];
    expect(traffic).toBeDefined();
    if (!traffic) return;
    input.database.traffic[0] = {
      ...traffic,
      errorClass: "config_invalid",
      latestSuccessAt: null,
      provider: "ga4",
      status: "failed",
    };

    const event = buildHeartbeatEvent(input);

    expect(event.fields?.Traffic).toContain(
      "last success never; likely misconfigured - check Integrations",
    );
    expect(event.severity).toBe("warning");
    expect(event.title).toBe("bisibility daily digest - 1 warning");
  });

  it("keeps a never-successful provider_4xx failure at error severity", () => {
    const input = healthyInput();
    const traffic = input.database.traffic[0];
    expect(traffic).toBeDefined();
    if (!traffic) return;
    input.database.traffic[0] = {
      ...traffic,
      errorClass: "provider_4xx",
      latestSuccessAt: null,
      provider: "ga4",
      status: "failed",
    };

    const event = buildHeartbeatEvent(input);

    expect(event.fields?.Traffic).not.toContain("likely misconfigured");
    expect(event.severity).toBe("error");
    expect(event.title).toBe("bisibility daily digest - 1 error");
  });

  it("renders error causes and keeps verdict counts equal to attention lines", () => {
    const input = healthyInput();
    input.database.rank = {
      ...input.database.rank,
      failed: 2,
      stuck: 1,
      succeeded: 0,
      topFailures: ["keyword_1: failed", "keyword_2: failed"],
    };
    input.database.bootstrapErrors = ["rank-check-1: failed"];
    input.database.undeliveredEvents = 3;

    const event = buildHeartbeatEvent(input);
    const lines = attentionLines(event);
    const counts = [...event.title.matchAll(/(\d+) (?:warning|error)/g)].reduce(
      (total, match) => total + Number(match[1]),
      0,
    );

    expect(event.severity).toBe("error");
    expect(event.title).toBe("bisibility daily digest - 4 errors");
    expect(lines).toHaveLength(4);
    expect(counts).toBe(lines.length);
    expect(lines.join(" ")).toContain("2 failed");
    expect(lines.join(" ")).toContain("1 stuck");
    expect(lines.join(" ")).toContain("3 events undelivered");
    expect(lines.join(" ")).toContain("Schedule bootstrap: 1 error");
    expectSafeRenderedDigest(event);
  });

  it("surfaces a soft fallback signal with the top provider and summarized reason", () => {
    const input = healthyInput();
    input.database.rank = {
      ...input.database.rank,
      recentFallbacks: [
        {
          errorSummary: "Provider request timed out",
          occurredAt: "2026-07-17T10:00:00.000Z",
          projectId: "project_1",
          provider: "dataforseo",
        },
        {
          errorSummary: "Provider request timed out",
          occurredAt: "2026-07-17T10:30:00.000Z",
          projectId: "project_2",
          provider: "dataforseo",
        },
        {
          errorSummary: "Provider rate limited",
          occurredAt: "2026-07-17T11:00:00.000Z",
          projectId: "project_1",
          provider: "serpapi",
        },
      ],
    };

    const event = buildHeartbeatEvent(input);
    const lines = attentionLines(event);

    expect(event.severity).toBe("warning");
    expect(lines).toEqual([
      "Rank checks: 3 provider fallbacks recorded - top: dataforseo (Provider request timed out).",
    ]);
    expectSafeRenderedDigest(event);
  });

  it("adds no fallback line when the window recorded no fallbacks", () => {
    const input = healthyInput();
    input.database.rank = { ...input.database.rank, recentFallbacks: [] };

    const event = buildHeartbeatEvent(input);

    expect(attentionLines(event)).toEqual([]);
    expect(event.severity).toBe("info");
  });

  it("classifies restart-adjacent schedule counters as recovered transient state", () => {
    const input = healthyInput();
    input.workerStartedAt = new Date("2026-07-17T06:00:00.000Z");
    input.temporal = {
      ...input.temporal,
      issueSchedules: ["rank-check-1: catchup 1, overlap 2"],
      missedCatchupTotal: 1,
      scheduleIssues: [
        {
          gapAt: "2026-07-17T06:00:00.000Z",
          missedCatchup: 1,
          recoveredAt: "2026-07-17T06:30:00.000Z",
          scheduleId: "rank-check-1",
          skippedOverlap: 2,
        },
      ],
      skippedOverlapTotal: 2,
    };

    const event = buildHeartbeatEvent(input);

    expect(event.severity).toBe("info");
    expect(event.title).toContain("all healthy");
    expect(event.fields).not.toHaveProperty("Needs attention");
    expect(event.fields?.Transient).toBe(
      "Worker restart at 06:00 UTC: 1 missed catchup, 2 skipped overlap - recovered, schedules running.",
    );
    expectSafeRenderedDigest(event);
  });

  it("renders old flat lifetime counters as informational instead of alerting again", () => {
    const input = healthyInput();
    input.now = new Date("2026-07-19T06:00:00.000Z");
    input.workerStartedAt = new Date("2026-07-18T16:24:00.000Z");
    input.temporalCounterState = {
      status: "available",
      totals: { missedCatchup: 1, skippedOverlap: 2 },
    };
    input.temporal = {
      ...input.temporal,
      missedCatchupTotal: 1,
      scheduleIssues: [
        {
          gapAt: "2026-07-18T16:30:00.000Z",
          missedCatchup: 1,
          recoveredAt: "2026-07-18T16:35:00.000Z",
          scheduleId: "rank-check-1",
          skippedOverlap: 2,
        },
      ],
      skippedOverlapTotal: 2,
    };

    const event = buildHeartbeatEvent(input);

    expect(event.severity).toBe("info");
    expect(event.fields).not.toHaveProperty("Needs attention");
    expect(event.fields?.["Temporal counters"]).toContain("unchanged since previous digest");
  });

  it("alerts on growth and attributes the new missed catchup to the schedule", () => {
    const input = healthyInput();
    input.temporalCounterState = {
      status: "available",
      perSchedule: { "rank-check-1": { missedCatchup: 1, skippedOverlap: 2 } },
      totals: { missedCatchup: 1, skippedOverlap: 2 },
    };
    input.temporal = {
      ...input.temporal,
      missedCatchupTotal: 2,
      scheduleIssues: [
        {
          gapAt: null,
          missedCatchup: 2,
          recoveredAt: null,
          scheduleId: "rank-check-1",
          skippedOverlap: 2,
        },
      ],
      skippedOverlapTotal: 2,
    };

    const event = buildHeartbeatEvent(input);

    expect(event.severity).toBe("warning");
    expect(attentionLines(event)).toEqual([
      expect.stringContaining("1 new missed catchup and 0 new skipped overlap"),
    ]);
    expect(attentionLines(event)[0]).toContain("inspect affected schedules: rank-check-1 +1");
    expectSafeRenderedDigest(event);
  });

  it("breaks the new missed catchup down per schedule, top 5 by delta then +N more", () => {
    const input = healthyInput();
    const baseline: Record<string, { missedCatchup: number; skippedOverlap: number }> = {};
    const issues = [
      ["rank-check-reconciler", 276, 0],
      ["maintenance-stale-checks", 91, 0],
      ["maintenance-stale-import-jobs", 91, 3],
      ["schedule-d", 20, 0],
      ["schedule-e", 10, 0],
      ["schedule-f", 5, 0],
    ] as const;
    for (const [scheduleId] of issues) {
      baseline[scheduleId] = { missedCatchup: 0, skippedOverlap: 0 };
    }
    input.temporalCounterState = {
      status: "available",
      perSchedule: baseline,
      totals: { missedCatchup: 0, skippedOverlap: 0 },
    };
    input.temporal = {
      ...input.temporal,
      missedCatchupTotal: 493,
      scheduleIssues: issues.map(([scheduleId, missedCatchup, skippedOverlap]) => ({
        gapAt: null,
        missedCatchup,
        recoveredAt: null,
        scheduleId,
        skippedOverlap,
      })),
      skippedOverlapTotal: 3,
    };

    const event = buildHeartbeatEvent(input);
    const line = attentionLines(event)[0] ?? "";

    expect(line).toContain("493 new missed catchup and 3 new skipped overlap");
    expect(line).toContain(
      "rank-check-reconciler +276, maintenance-stale-import-jobs +91 (+3 skipped), maintenance-stale-checks +91, schedule-d +20, schedule-e +10, +1 more",
    );
    expect(line).not.toContain("schedule-f");
    expectSafeRenderedDigest(event);
  });

  it("labels the breakdown as lifetime totals when no per-schedule baseline exists yet", () => {
    const input = healthyInput();
    input.temporalCounterState = {
      status: "available",
      totals: { missedCatchup: 0, skippedOverlap: 0 },
    };
    input.temporal = {
      ...input.temporal,
      missedCatchupTotal: 5,
      scheduleIssues: [
        {
          gapAt: null,
          missedCatchup: 5,
          recoveredAt: null,
          scheduleId: "rank-check-reconciler",
          skippedOverlap: 0,
        },
      ],
      skippedOverlapTotal: 0,
    };

    const event = buildHeartbeatEvent(input);
    const line = attentionLines(event)[0] ?? "";

    expect(line).toContain("rank-check-reconciler +5");
    expect(line).toContain("lifetime totals; per-schedule baseline not yet recorded");
  });

  it("reports unavailable counters instead of silently establishing a new baseline", () => {
    const input = healthyInput();
    input.temporalCounterState = { status: "unavailable" };
    input.temporal = { ...input.temporal, missedCatchupTotal: 4 };

    const event = buildHeartbeatEvent(input);

    expect(event.severity).toBe("warning");
    expect(attentionLines(event)).toEqual([
      expect.stringContaining("Temporal counters unavailable"),
    ]);
    expect(event.fields?.["Temporal counters"]).toBe(
      "Counters unavailable · missed-catchup delta not evaluated",
    );
  });
});
