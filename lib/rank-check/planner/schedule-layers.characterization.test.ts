/**
 * Characterization of what the rank-check planner schedules in `dispatcher` mode.
 *
 * Characterization only; expectations were recorded by running the current code. The fake
 * `checkSchedule.findMany` evaluates the planner's own `where` and `select` against in-memory
 * rows and throws on any filter it does not understand. KeywordSchedule rows are present in the
 * fixture data, so a planner query that started to read them would have to say so.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown>;

const NOW = new Date("2026-10-21T12:00:00.000Z");
const DAY_MS = 24 * 3_600_000;

const mocks = vi.hoisted(() => ({
  assertBudgetAvailable: vi.fn(),
  loadNativeRankRequestCosts: vi.fn(),
  persistOccurrence: vi.fn(),
  queries: [] as string[],
}));

// Fixture mirrors the dispatcher-side characterization: weekly named schedule (top 10) with two
// members, one of which also has a daily KeywordSchedule row (top 100); a third keyword with no
// named schedule; project defaults monthly, top 50.
const data = vi.hoisted(() => ({
  checkSchedules: [
    {
      archivedAt: null,
      createdAt: new Date("2026-10-20T00:00:00.000Z"),
      cronExpression: null,
      enabled: true,
      frequency: "weekly",
      id: "sch-weekly",
      jitterMinutes: 60,
      projectId: "project",
      publicId: "sch_weekly",
      serpDepth: 10,
      timeOfDay: "06:00",
      timezone: "UTC",
    },
  ] as Record<string, unknown>[],
  keywords: [
    { archivedAt: null, checkScheduleId: "sch-weekly", id: "k-both", locationId: "loc" },
    { archivedAt: null, checkScheduleId: "sch-weekly", id: "k-member", locationId: "loc" },
    { archivedAt: null, checkScheduleId: null, id: "k-default", locationId: "loc" },
  ].map((keyword) => ({ ...keyword, publicId: `kw_${keyword.id}`, projectId: "project" })),
  keywordSchedules: [{ frequency: "daily", keywordId: "k-both", serpDepth: 100 }],
  project: {
    defaults: { serpDepth: 50, timezone: "UTC" },
    markets: [{ locationId: "loc" }],
  },
}));

function matches(row: Row, where: Row | undefined) {
  for (const [field, condition] of Object.entries(where ?? {})) {
    if (!(field in row)) throw new Error(`Unsupported filter field: ${field}`);
    const value = row[field];
    if (condition === null) {
      if (value !== null) return false;
      continue;
    }
    if (typeof condition === "object") {
      for (const [operator, operand] of Object.entries(condition as Row)) {
        if (operator !== "in") throw new Error(`Unsupported operator: ${field}.${operator}`);
        if (!(operand as unknown[]).includes(value)) return false;
      }
      continue;
    }
    if (value !== condition) return false;
  }
  return true;
}

function pick(row: Row, select: Row) {
  return Object.fromEntries(Object.keys(select).map((key) => [key, row[key]]));
}

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    $transaction: async (callback: (tx: unknown) => unknown) => callback({}),
    checkSchedule: {
      findMany: async (input: { select: Row; take: number; where: Row }) => {
        mocks.queries.push("checkSchedule.findMany");
        const {
          keywords: keywordSelect,
          project: _project,
          ...scalars
        } = input.select as {
          keywords: { select: Row; where: Row };
          project: unknown;
        };
        return data.checkSchedules
          .filter((schedule) => matches(schedule, input.where))
          .slice(0, input.take)
          .map((schedule) => ({
            ...pick(schedule, scalars),
            keywords: data.keywords
              .filter((keyword) => keyword.checkScheduleId === schedule.id)
              .filter((keyword) => matches(keyword, keywordSelect.where))
              .map((keyword) => pick(keyword, keywordSelect.select)),
            project: data.project,
          }));
      },
    },
  },
}));
vi.mock("@/lib/provider-allocations/project-lock", () => ({
  lockProjectForProviderMutation: vi.fn(),
}));
vi.mock("./reconcile-scheduled-items", () => ({ cancelObsoleteScheduleItems: vi.fn() }));
vi.mock("./empty-schedule", () => ({ skipEmptyScheduleOccurrences: vi.fn() }));
vi.mock("./persist-occurrence", () => ({ persistOccurrence: mocks.persistOccurrence }));
vi.mock("@/lib/operations/access-extension", () => ({ assertOperationAccess: vi.fn() }));
vi.mock("@/lib/rank-check/queued-routing", () => ({
  queuedRankCheckRoute: async () => ({ mode: "legacy", reason: "queued_dataforseo_disabled" }),
}));
vi.mock("@/lib/rank-check/provider-chain-loader", () => ({
  loadSerpProviderChain: async () => [
    {
      costPerCheckCents: 1,
      credentialSource: "byok",
      credentialsEncrypted: null,
      id: "connection",
      provider: "serpapi",
      rateContext: null,
    },
  ],
}));
vi.mock("@/lib/provider-rates/native-rank-request", () => ({
  loadNativeRankRequestCosts: mocks.loadNativeRankRequestCosts,
}));
vi.mock("@/lib/rank-check/budget", () => ({
  assertBudgetAvailable: mocks.assertBudgetAvailable,
  isBudgetExhaustedError: () => false,
}));

import { planRankCheckRuns, scheduleAdmission } from "./plan";

function planned() {
  return mocks.persistOccurrence.mock.calls.map(([schedule, occurrence]) => ({
    members: (schedule as { keywords: { id: string }[] }).keywords.map(({ id }) => id),
    plannedFor: (occurrence as { plannedFor: Date }).plannedFor.toISOString(),
    schedule: (schedule as { publicId: string }).publicId,
  }));
}

beforeEach(() => {
  vi.stubEnv("RANK_CHECK_SCHEDULER_MODE", "dispatcher");
  vi.clearAllMocks();
  mocks.queries.length = 0;
  mocks.persistOccurrence.mockResolvedValue("run");
  mocks.loadNativeRankRequestCosts.mockImplementation(
    async (_client: unknown, _connection: unknown, requests: unknown[]) => requests.map(() => 1),
  );
});

describe("dispatcher mode: the planner", () => {
  it("plans only named-schedule members, once per weekly occurrence, ignoring KeywordSchedule", async () => {
    await planRankCheckRuns({ now: NOW });
    await planRankCheckRuns({ now: new Date(NOW.getTime() + 7 * DAY_MS) });

    expect(mocks.queries).toEqual(["checkSchedule.findMany", "checkSchedule.findMany"]);
    // One occurrence inside each 7-day horizon: Mondays at 06:00 UTC. `k-both` is planned
    // weekly although its KeywordSchedule says daily; `k-default` has no named schedule and is
    // never planned.
    expect(planned()).toEqual([
      {
        members: ["k-both", "k-member"],
        plannedFor: "2026-10-26T06:00:00.000Z",
        schedule: "sch_weekly",
      },
      {
        members: ["k-both", "k-member"],
        plannedFor: "2026-11-02T06:00:00.000Z",
        schedule: "sch_weekly",
      },
    ]);
  });

  it("finds no work for a keyword outside every named schedule, whatever its KeywordSchedule says", async () => {
    data.keywordSchedules.push({ frequency: "daily", keywordId: "k-default", serpDepth: 100 });
    try {
      await planRankCheckRuns({ now: NOW });
    } finally {
      data.keywordSchedules.pop();
    }
    expect(planned().flatMap(({ members }) => members)).not.toContain("k-default");
  });

  it("checks at the named schedule depth, never the KeywordSchedule depth", async () => {
    const keywords = [
      { id: "k-both", text: "both" },
      { id: "k-member", text: "member" },
    ];
    // materializePlannedRun passes exactly these fields (planner/materialize.ts).
    const named = await scheduleAdmission(
      {
        keywords,
        project: data.project,
        projectId: "project",
        providerPolicy: null,
        serpDepth: 10,
      },
      NOW,
    );
    const inherit = await scheduleAdmission(
      {
        keywords,
        project: data.project,
        projectId: "project",
        providerPolicy: null,
        serpDepth: null,
      },
      NOW,
    );

    expect(named).toMatchObject({ blockedReason: null, depth: 10 });
    // A named schedule with no depth follows the project default (50), not KeywordSchedule (100).
    expect(inherit).toMatchObject({ blockedReason: null, depth: 50 });
    expect(mocks.loadNativeRankRequestCosts.mock.calls.map(([, , requests]) => requests)).toEqual([
      [
        { depth: 10, keyword: "both" },
        { depth: 10, keyword: "member" },
      ],
      [
        { depth: 50, keyword: "both" },
        { depth: 50, keyword: "member" },
      ],
    ]);
  });
});
