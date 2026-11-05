import { randomUUID } from "node:crypto";
import { businessLocationDatabase } from "@/lib/business-location-store/postgres.test-fixture";
import { makePublicId } from "@/lib/db/public-id";
import type { PrismaClient } from "@/lib/generated/prisma/client";
import type { Client } from "pg";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ db: null as PrismaClient | null }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({
  get prisma() {
    if (!state.db) throw new Error("fixture unavailable");
    return state.db;
  },
}));

import { evaluateKeywordAlerts } from "@/lib/alerts/evaluate";

const barrierKey = "fixture-alert-insert-barrier";
const mismatch = "https://example.com/wrong";
const aligned = "https://example.com/target";
const before = { normalizationVersion: "v2", position: 5, requestedDepth: 100 };
let fixture: Awaited<ReturnType<typeof businessLocationDatabase>>;
let keywordId = "";
let projectId = "";
let ruleId = "";
let olderCheckId = "";
let newerCheckId = "";
let laterCheckId = "";
const olderAt = new Date("2026-11-01T10:00:00.000Z");
const newerAt = new Date("2026-11-01T12:00:00.000Z");
const laterAt = new Date("2026-11-01T14:00:00.000Z");

beforeAll(async () => {
  fixture = await businessLocationDatabase();
  state.db = fixture.db;
  const user = await fixture.db.user.create({
    data: { email: `${randomUUID()}@example.com`, name: "Fixture", publicId: makePublicId("usr") },
  });
  const project = await fixture.db.project.create({
    data: {
      domain: "example.com",
      name: "Fixture",
      ownerId: user.id,
      publicId: makePublicId("prj"),
    },
  });
  const location = await fixture.db.location.create({
    data: {
      canonicalKey: randomUUID(),
      countryCode: "US",
      displayName: "Example",
      gl: "us",
      hl: "en",
      kind: "city",
      languageCode: "en",
      languageLabel: "English",
      primaryGeoName: "Example",
      secondaryGeoName: "Example",
    },
  });
  const keyword = await fixture.db.keyword.create({
    data: {
      location: "Example",
      locationId: location.id,
      projectId: project.id,
      publicId: makePublicId("kw"),
      targetUrl: aligned,
      text: "example fixture",
    },
  });
  keywordId = keyword.id;
  projectId = project.id;
  const rule = await fixture.db.alertRule.create({
    data: {
      channels: [],
      conditionType: "url_mismatch",
      enabled: true,
      name: "URL mismatch",
      projectId: project.id,
      publicId: makePublicId("alr"),
      severity: "urgent",
      targetType: "all",
    },
  });
  ruleId = rule.id;
  const checks = await Promise.all(
    [olderAt, newerAt, laterAt].map((checkedAt) =>
      fixture.db.rankCheck.create({
        data: {
          checkedAt,
          keywordId,
          normalizationVersion: "v2",
          position: 5,
          provider: "fixture",
          publicId: makePublicId("check"),
          requestedDepth: 100,
          status: "completed",
        },
      }),
    ),
  );
  olderCheckId = checks[0].id;
  newerCheckId = checks[1].id;
  laterCheckId = checks[2].id;
}, 300_000);

afterAll(async () => {
  await fixture?.close();
});

beforeEach(async () => {
  await fixture.db.triggeredAlert.deleteMany({ where: { keywordId } });
});

function snapshot(rankCheckId: string, checkedAt: Date, rankingUrl: string) {
  return { ...before, checkedAt, rankCheckId, rankingUrl };
}

function evaluate(rankCheckId: string, checkedAt: Date, rankingUrl: string) {
  return evaluateKeywordAlerts(keywordId, before, snapshot(rankCheckId, checkedAt, rankingUrl));
}

async function advisoryWaiters(client: Client) {
  const result = await client.query<{ waiting: number }>(
    `SELECT count(*)::int AS waiting FROM pg_stat_activity
     WHERE datname = current_database() AND wait_event = 'advisory'
       AND state = 'active' AND pid <> pg_backend_pid()`,
  );
  return Number(result.rows[0]?.waiting ?? 0);
}

async function waitForAdvisoryWaiters(client: Client, expected: number) {
  const started = Date.now();
  while (Date.now() - started < 4_000) {
    if ((await advisoryWaiters(client)) >= expected) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`advisory waiters did not reach ${expected}`);
}

async function withInsertBarrier<T>(start: () => Promise<T>) {
  const client = fixture.client;
  await client.query(
    `CREATE OR REPLACE FUNCTION fixture_alert_insert_barrier() RETURNS trigger LANGUAGE plpgsql AS $fn$
     BEGIN PERFORM pg_advisory_xact_lock(hashtext('${barrierKey}')); RETURN NEW; END $fn$`,
  );
  await client.query(
    "CREATE TRIGGER fixture_alert_insert_barrier BEFORE INSERT ON triggered_alerts FOR EACH ROW EXECUTE FUNCTION fixture_alert_insert_barrier()",
  );
  await client.query("SELECT pg_advisory_lock(hashtext($1))", [barrierKey]);
  const pending = start();
  try {
    await waitForAdvisoryWaiters(client, 2);
  } finally {
    await client.query("SELECT pg_advisory_unlock(hashtext($1))", [barrierKey]);
  }
  try {
    return await pending;
  } finally {
    await client.query("DROP TRIGGER IF EXISTS fixture_alert_insert_barrier ON triggered_alerts");
    await client.query("DROP FUNCTION IF EXISTS fixture_alert_insert_barrier()");
  }
}

async function openIncidents() {
  return fixture.db.triggeredAlert.count({
    where: { keywordId, status: { not: "resolved" } },
  });
}

it("keeps one open incident when two different checks race", async () => {
  const results = await withInsertBarrier(() =>
    Promise.all([
      evaluate(olderCheckId, olderAt, mismatch),
      evaluate(newerCheckId, newerAt, mismatch),
    ]),
  );
  expect(results.map((alerts) => alerts.length).sort()).toEqual([0, 1]);
  expect(await openIncidents()).toBe(1);
});

it("deduplicates a later check while an incident is already open", async () => {
  expect(await evaluate(olderCheckId, olderAt, mismatch)).toHaveLength(1);
  expect(await evaluate(newerCheckId, newerAt, mismatch)).toHaveLength(0);
  expect(await openIncidents()).toBe(1);
});

it("deduplicates the same check when two evaluations race", async () => {
  const results = await Promise.all([
    evaluate(newerCheckId, newerAt, mismatch),
    evaluate(newerCheckId, newerAt, mismatch),
  ]);
  expect(results.flat()).toHaveLength(1);
  expect(await openIncidents()).toBe(1);
});

it("keeps a newer match open when an older clear arrives and still resolves a later clear", async () => {
  expect(await evaluate(newerCheckId, newerAt, mismatch)).toHaveLength(1);
  expect(await evaluate(olderCheckId, olderAt, aligned)).toHaveLength(0);
  expect(await openIncidents()).toBe(1);
  expect(await evaluate(laterCheckId, laterAt, aligned)).toHaveLength(0);
  expect(await openIncidents()).toBe(0);
});

it("dedupes a cleared check inside the incident transaction and still runs a later rule", async () => {
  expect(await evaluate(olderCheckId, olderAt, mismatch)).toHaveLength(1);
  expect(await evaluate(newerCheckId, newerAt, aligned)).toHaveLength(0);
  expect(await openIncidents()).toBe(0);
  const laterRule = await fixture.db.alertRule.create({
    data: {
      channels: [],
      conditionType: "url_mismatch",
      enabled: true,
      name: "URL mismatch follow-up",
      projectId,
      publicId: makePublicId("alr"),
      severity: "urgent",
      targetType: "all",
    },
  });
  try {
    await expect(evaluate(olderCheckId, olderAt, mismatch)).resolves.toHaveLength(1);
    expect(
      await fixture.db.triggeredAlert.count({
        where: { keywordId, rankCheckId: olderCheckId, ruleId },
      }),
    ).toBe(1);
    expect(
      await fixture.db.triggeredAlert.count({
        where: {
          keywordId,
          rankCheckId: olderCheckId,
          ruleId: laterRule.id,
          status: { not: "resolved" },
        },
      }),
    ).toBe(1);
    expect(await openIncidents()).toBe(1);
  } finally {
    await fixture.db.triggeredAlert.deleteMany({ where: { ruleId: laterRule.id } });
    await fixture.db.alertRule.delete({ where: { id: laterRule.id } });
  }
});

it("does not reopen a match between the opening check and the clearing check", async () => {
  const middleAt = new Date("2026-11-01T13:00:00.000Z");
  const afterAt = new Date("2026-11-01T16:00:00.000Z");
  const [middle, after] = await Promise.all(
    [middleAt, afterAt].map((checkedAt) =>
      fixture.db.rankCheck.create({
        data: {
          checkedAt,
          keywordId,
          normalizationVersion: "v2",
          position: 5,
          provider: "fixture",
          publicId: makePublicId("check"),
          requestedDepth: 100,
          status: "completed",
        },
      }),
    ),
  );
  try {
    expect(await evaluate(olderCheckId, olderAt, mismatch)).toHaveLength(1);
    expect(await evaluate(laterCheckId, laterAt, aligned)).toHaveLength(0);
    expect(
      await fixture.db.triggeredAlert.findFirstOrThrow({ where: { keywordId, ruleId } }),
    ).toMatchObject({ resolvedAt: laterAt, status: "resolved" });
    expect(await evaluate(middle.id, middleAt, mismatch)).toEqual([]);
    expect(await openIncidents()).toBe(0);
    expect(await evaluate(after.id, afterAt, mismatch)).toHaveLength(1);
    expect(await openIncidents()).toBe(1);
  } finally {
    await fixture.db.triggeredAlert.deleteMany({
      where: { rankCheckId: { in: [middle.id, after.id] } },
    });
    await fixture.db.rankCheck.deleteMany({ where: { id: { in: [middle.id, after.id] } } });
  }
});

it("does not reopen an older match after a newer incident was cleared", async () => {
  expect(await evaluate(newerCheckId, newerAt, mismatch)).toHaveLength(1);
  expect(await evaluate(laterCheckId, laterAt, aligned)).toHaveLength(0);
  expect(await openIncidents()).toBe(0);
  expect(await evaluate(olderCheckId, olderAt, mismatch)).toEqual([]);
  expect(await openIncidents()).toBe(0);
});
