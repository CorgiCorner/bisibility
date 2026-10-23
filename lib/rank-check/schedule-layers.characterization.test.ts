/**
 * Characterization of the retained dispatch-state projection in dispatcher mode.
 * The planner, not this legacy projection, owns automatic checks. API cadence membership
 * is covered by schedules/keyword-cadence.postgres.test.ts using the real database contract.
 */
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const POSTGRES_TIMESTAMP_OID = 1114;
const NOW = new Date("2026-10-21T12:00:00.000Z");

type RawQuery = { text: string; values: unknown[] };

const state = vi.hoisted(() => ({
  db: null as unknown as import("@electric-sql/pglite").PGlite,
  queries: [] as { text: string }[],
}));
const mocks = vi.hoisted(() => ({
  claimDueRankCheckItems: vi.fn(),
}));

function formatTimestamp(date: Date) {
  return date.toISOString().replace("T", " ").replace("Z", "");
}

function parseTimestamp(value: string) {
  return new Date(`${value.replace(" ", "T")}Z`);
}

async function raw(query: RawQuery) {
  state.queries.push({ text: query.text });
  return state.db.query(query.text, query.values);
}

const rawClient = {
  $executeRaw: async (query: RawQuery) => (await raw(query)).affectedRows ?? 0,
  $queryRaw: async (query: RawQuery) => (await raw(query)).rows,
};

const fakePrisma = {
  ...rawClient,
  $transaction: async <T>(callback: (tx: typeof rawClient) => Promise<T>) => callback(rawClient),
};

vi.mock("server-only", () => ({}));
// A getter defers the read past vi.mock hoisting; modules dereference `prisma` only at call time.
vi.mock("@/lib/db/prisma", () => ({
  get prisma() {
    return fakePrisma;
  },
}));
vi.mock("./items-claim", () => ({ claimDueRankCheckItems: mocks.claimDueRankCheckItems }));

import { claimDueRankChecks } from "./dispatcher";
import { refreshKeywordDispatchStates } from "./dispatcher-state";

// Three keywords, one project, one active market.
// - both:    member of the weekly named schedule (top 10) AND a daily KeywordSchedule row (top 100)
// - member:  member of the weekly named schedule, no KeywordSchedule row
// - default: no named schedule, no KeywordSchedule row (project defaults: monthly, top 50)
const KW = {
  both: { id: "k-both", publicId: "kw_both00000000000000000000" },
  member: { id: "k-member", publicId: "kw_member000000000000000000" },
  default: { id: "k-default", publicId: "kw_default00000000000000000" },
} as const;

async function seed() {
  await state.db.exec(`
    DROP TABLE IF EXISTS users, projects, project_markets, project_defaults, check_schedules,
      keywords, keyword_schedules, keyword_dispatch_states;
    CREATE TABLE users (id text PRIMARY KEY, "deactivatedAt" timestamp(3));
    CREATE TABLE projects (
      id text PRIMARY KEY, "ownerId" text NOT NULL, domain text, "writeMode" text DEFAULT 'active'
    );
    CREATE TABLE project_markets ("projectId" text, "locationId" text, status text);
    CREATE TABLE project_defaults (
      "projectId" text PRIMARY KEY, frequency text NOT NULL, "cronExpression" text,
      timezone text NOT NULL, "jitterMinutes" int NOT NULL, "nextCheckAt" timestamp(3),
      "serpDepth" int
    );
    CREATE TABLE check_schedules (
      id text PRIMARY KEY, "publicId" text, "projectId" text, name text, "archivedAt" timestamp(3),
      frequency text, "cronExpression" text, "timeOfDay" text, timezone text,
      "jitterMinutes" int, "serpDepth" int, "providerPolicy" text, enabled boolean,
      "isDefault" boolean
    );
    CREATE TABLE keywords (
      id text PRIMARY KEY, "publicId" text, "projectId" text, "locationId" text, text text,
      device text, "archivedAt" timestamp(3), "checkScheduleId" text
    );
    CREATE TABLE keyword_schedules (
      id text PRIMARY KEY, "keywordId" text UNIQUE NOT NULL, frequency text NOT NULL,
      "serpDepth" int, "cronExpression" text, timezone text NOT NULL, "jitterMinutes" int NOT NULL,
      "nextCheckAt" timestamp(3)
    );
    CREATE TABLE keyword_dispatch_states ("keywordId" text PRIMARY KEY, "nextCheckAt" timestamp(3));
    INSERT INTO users VALUES ('owner', NULL);
    INSERT INTO projects VALUES ('project', 'owner', 'example.com', 'active');
    INSERT INTO project_markets VALUES ('project', 'loc', 'active');
    INSERT INTO project_defaults VALUES ('project', 'monthly', NULL, 'UTC', 60, '2026-11-05 03:00:00', 50);
    INSERT INTO check_schedules VALUES ('sch-weekly', 'sch_weekly', 'project', 'Weekly top 10',
      NULL, 'weekly', NULL, '06:00', 'UTC', 60, 10, NULL, true, false);
    INSERT INTO keywords VALUES
      ('${KW.both.id}', '${KW.both.publicId}', 'project', 'loc', 'both', 'desktop', NULL,
        'sch-weekly'),
      ('${KW.member.id}', '${KW.member.publicId}', 'project', 'loc', 'member', 'desktop', NULL,
        'sch-weekly'),
      ('${KW.default.id}', '${KW.default.publicId}', 'project', 'loc', 'default', 'desktop', NULL,
        NULL);
    INSERT INTO keyword_schedules VALUES
      ('ks-${KW.both.id}', '${KW.both.id}', 'daily', 100, NULL, 'UTC', 60, NULL);
  `);
}

async function dispatchStates() {
  const result = await state.db.query<{ keywordId: string; nextCheckAt: Date }>(
    `SELECT "keywordId", "nextCheckAt" FROM keyword_dispatch_states ORDER BY "keywordId"`,
  );
  return Object.fromEntries(result.rows.map((row) => [row.keywordId, row.nextCheckAt]));
}

beforeAll(() => {
  state.db = new PGlite({
    parsers: { [POSTGRES_TIMESTAMP_OID]: parseTimestamp },
    serializers: { [POSTGRES_TIMESTAMP_OID]: formatTimestamp },
  });
});

afterAll(async () => {
  vi.useRealTimers();
  await state.db.close();
});

beforeEach(async () => {
  vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
  vi.stubEnv("RANK_CHECK_SCHEDULER_MODE", "dispatcher");
  vi.clearAllMocks();
  state.queries = [];
  mocks.claimDueRankCheckItems.mockResolvedValue({ claimed: 0, groups: [] });
  await state.db.exec("SET TIME ZONE 'UTC';");
  await seed();
});

describe("dispatcher mode: keyword_dispatch_states", () => {
  it("derives dispatch state from KeywordSchedule, else project defaults, never from the named schedule", async () => {
    await refreshKeywordDispatchStates({
      keywordIds: [KW.both.id, KW.member.id, KW.default.id],
      now: NOW,
    });

    expect(await dispatchStates()).toEqual({
      // The daily KeywordSchedule row (top 100) wins over the weekly named schedule (top 10).
      [KW.both.id]: new Date("2026-10-22T11:29:21.000Z"),
      // No KeywordSchedule row: the monthly project default applies, although `member` belongs to
      // the weekly named schedule. check_schedules is not an input to this SQL at all.
      [KW.member.id]: new Date("2026-11-05T03:59:09.000Z"),
      [KW.default.id]: new Date("2026-11-05T03:57:45.000Z"),
    });
    expect(state.queries.map(({ text }) => text).join("\n")).not.toContain("check_schedules");
  });

  it("never claims dispatch states: claimDueRankChecks delegates to planner-produced run items", async () => {
    await refreshKeywordDispatchStates({
      keywordIds: [KW.both.id, KW.member.id, KW.default.id],
      now: NOW,
    });
    const before = await dispatchStates();
    state.queries = [];

    // Forty days later every dispatch state above is overdue.
    const later = new Date(NOW.getTime() + 40 * 24 * 3_600_000);
    await claimDueRankChecks({ now: later }, fakePrisma as never);

    expect(mocks.claimDueRankCheckItems).toHaveBeenCalledTimes(1);
    expect(mocks.claimDueRankCheckItems).toHaveBeenCalledWith({ now: later }, fakePrisma);
    // Not one statement touched keyword_dispatch_states, and none of them advanced.
    expect(state.queries).toEqual([]);
    expect(await dispatchStates()).toEqual(before);
  });
});
