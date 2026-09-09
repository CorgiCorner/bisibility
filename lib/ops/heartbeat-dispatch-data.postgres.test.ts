import { PGlite } from "@electric-sql/pglite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { collectRankDispatchHeartbeat } from "./heartbeat-dispatch-data";

const POSTGRES_TIMESTAMP_OID = 1114;
const now = new Date("2026-09-09T14:00:00.000Z");
const staleQueuedBefore = new Date("2026-09-09T13:45:00.000Z");

type RawQuery = { text: string; values: unknown[] };

function formatPrismaTimestamp(date: Date) {
  const pad = (value: number, width = 2) => String(value).padStart(width, "0");
  const milliseconds = date.getUTCMilliseconds();
  return `${pad(date.getUTCFullYear(), 4)}-${pad(date.getUTCMonth() + 1)}-${pad(
    date.getUTCDate(),
  )} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}${
    milliseconds ? `.${pad(milliseconds, 3)}` : ""
  }`;
}

function parsePrismaTimestamp(value: string) {
  return new Date(`${value.replace(" ", "T")}+00:00`);
}

let db: PGlite;
let queries: RawQuery[];

function database() {
  return {
    $queryRaw: async <T>(query: RawQuery) => {
      queries.push(query);
      return (await db.query(query.text, query.values)).rows as T;
    },
  };
}

beforeEach(async () => {
  queries = [];
  db = new PGlite({
    parsers: { [POSTGRES_TIMESTAMP_OID]: parsePrismaTimestamp },
    serializers: { [POSTGRES_TIMESTAMP_OID]: formatPrismaTimestamp },
  });
  await db.exec("SET TIME ZONE 'UTC';");
  await db.exec(`
    CREATE TABLE rank_check_runs (id text PRIMARY KEY, status text NOT NULL);
    CREATE TABLE rank_check_run_items (
      id text PRIMARY KEY,
      "runId" text NOT NULL,
      status text NOT NULL,
      "rankCheckId" text,
      "claimExpiresAt" timestamp(3),
      "notBefore" timestamp(3)
    );
    INSERT INTO rank_check_runs (id, status) VALUES
      ('active-running', 'running'), ('active-queued', 'queued'),
      ('completed', 'completed'), ('blocked', 'blocked'), ('cancelling', 'cancelling'),
      ('planned', 'planned'), ('paused', 'paused');
    INSERT INTO rank_check_run_items
      (id, "runId", status, "rankCheckId", "claimExpiresAt", "notBefore") VALUES
      ('expired-old', 'active-running', 'running', NULL, '2026-09-09 12:00:00', NULL),
      ('expired-later', 'active-queued', 'running', NULL, '2026-09-09 13:00:00', NULL),
      ('overdue-live', 'active-running', 'queued', NULL, NULL, '2026-09-09 13:30:00'),
      ('overdue-linked', 'active-queued', 'queued', 'rank-queued', NULL, '2026-09-09 12:30:00'),
      ('future-queued', 'active-running', 'queued', NULL, NULL, '2026-09-09 14:01:00'),
      ('threshold-queued', 'active-running', 'queued', NULL, NULL, '2026-09-09 13:45:00'),
      ('null-not-before', 'active-running', 'queued', NULL, NULL, NULL),
      ('linked-running', 'active-running', 'running', 'rank-running', '2026-09-09 12:00:00', NULL),
      ('unexpired-running', 'active-running', 'running', NULL, '2026-09-09 14:00:00', NULL),
      ('terminal-expired', 'completed', 'running', NULL, '2026-09-09 12:00:00', NULL),
      ('blocked-expired', 'blocked', 'running', NULL, '2026-09-09 12:00:00', NULL),
      ('cancelling-queued', 'cancelling', 'queued', NULL, NULL, '2026-09-09 12:00:00'),
      ('planned-queued', 'planned', 'queued', NULL, NULL, '2026-09-09 12:00:00'),
      ('paused-queued', 'paused', 'queued', NULL, NULL, '2026-09-09 12:00:00');
  `);
});

afterEach(async () => {
  await db.close();
});

describe("rank dispatch heartbeat aggregate", () => {
  it("counts only actionable expired and overdue rows and serializes their oldest timestamps", async () => {
    await expect(collectRankDispatchHeartbeat(now, database() as never)).resolves.toEqual({
      expiredClaims: 2,
      oldestExpiredClaimAt: "2026-09-09T12:00:00.000Z",
      oldestOverdueQueuedAt: "2026-09-09T12:30:00.000Z",
      overdueQueued: 2,
    });
    expect(queries).toHaveLength(1);
    expect(queries[0]?.text).toContain("COUNT");
    expect(queries[0]?.text).toContain("MIN");
    expect(queries[0]?.text).toContain("::timestamp(3)");
    expect(queries[0]?.text).toContain("run.status IN ('queued', 'running')");
    expect(queries[0]?.text).toContain('item."rankCheckId" IS NULL');
    expect(queries[0]?.text).toContain('item."notBefore" IS NOT NULL');
    expect(queries[0]?.text).not.toContain('"createdAt"');
    expect(queries[0]?.text).not.toContain('"startedAt"');
    expect(queries[0]?.values).toEqual(expect.arrayContaining([now, staleQueuedBefore]));
  });

  it("reports recovery when the only actionable rows are no longer expired or overdue", async () => {
    await db.exec(`
      UPDATE rank_check_run_items
      SET "claimExpiresAt" = '2026-09-09 14:00:00'
      WHERE id IN ('expired-old', 'expired-later');
      UPDATE rank_check_run_items
      SET "notBefore" = '2026-09-09 13:45:00'
      WHERE id IN ('overdue-live', 'overdue-linked');
    `);

    await expect(collectRankDispatchHeartbeat(now, database() as never)).resolves.toEqual({
      expiredClaims: 0,
      oldestExpiredClaimAt: null,
      oldestOverdueQueuedAt: null,
      overdueQueued: 0,
    });
  });
});
