import { randomUUID } from "node:crypto";
import { MAX_ALERT_RULES_PER_PROJECT } from "@/lib/alerts/limits";
import { businessLocationDatabase } from "@/lib/business-location-store/postgres.test-fixture";
import { makePublicId } from "@/lib/db/public-id";
import type { PrismaClient } from "@/lib/generated/prisma/client";
import type { Client } from "pg";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { ApiConflictError } from "./errors";

const state = vi.hoisted(() => ({ db: null as PrismaClient | null }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({
  get prisma() {
    if (!state.db) throw new Error("fixture unavailable");
    return state.db;
  },
}));

import { createAlertRuleRecord } from "@/lib/api/alert-service";

const barrierKey = "fixture-alert-rule-insert-barrier";
let fixture: Awaited<ReturnType<typeof businessLocationDatabase>>;
let projectId = "";
let userId = "";

beforeAll(async () => {
  fixture = await businessLocationDatabase();
  state.db = fixture.db;
  const user = await fixture.db.user.create({
    data: { email: `${randomUUID()}@example.org`, name: "Fixture", publicId: makePublicId("usr") },
  });
  const project = await fixture.db.project.create({
    data: {
      domain: "example.org",
      name: "Fixture",
      ownerId: user.id,
      publicId: makePublicId("prj"),
    },
  });
  userId = user.id;
  projectId = project.id;
}, 300_000);

afterAll(async () => {
  await fixture?.close();
});

beforeEach(async () => {
  await fixture.db.alertRule.deleteMany({ where: { projectId } });
});

function input() {
  return {
    channels: [],
    conditionType: "threshold" as const,
    enabled: true,
    marketIds: [],
    name: "Rule",
    projectId,
    recipientIds: [],
    targetIds: [],
    targetType: "all" as const,
    thresholdPosition: 10,
  };
}

async function seedRules(count: number) {
  await fixture.db.alertRule.createMany({
    data: Array.from({ length: count }, (_, index) => ({
      channels: [],
      conditionType: "threshold" as const,
      enabled: true,
      name: `Seed ${index}`,
      projectId,
      publicId: makePublicId("alr"),
      severity: "warning" as const,
      targetType: "all" as const,
      thresholdPosition: 10,
    })),
  });
}

async function ruleCount() {
  return fixture.db.alertRule.count({ where: { projectId } });
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
    `CREATE OR REPLACE FUNCTION fixture_rule_insert_barrier() RETURNS trigger LANGUAGE plpgsql AS $fn$
     BEGIN PERFORM pg_advisory_xact_lock(hashtext('${barrierKey}')); RETURN NEW; END $fn$`,
  );
  await client.query(
    "CREATE TRIGGER fixture_rule_insert_barrier BEFORE INSERT ON alert_rules FOR EACH ROW EXECUTE FUNCTION fixture_rule_insert_barrier()",
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
    await client.query("DROP TRIGGER IF EXISTS fixture_rule_insert_barrier ON alert_rules");
    await client.query("DROP FUNCTION IF EXISTS fixture_rule_insert_barrier()");
  }
}

it("accepts one of two creates that both observe 49 rules", async () => {
  await seedRules(MAX_ALERT_RULES_PER_PROJECT - 1);
  const context = { actorId: userId, projectId };
  const settled = await withInsertBarrier(() =>
    Promise.allSettled([
      createAlertRuleRecord(input(), context),
      createAlertRuleRecord(input(), context),
    ]),
  );
  const fulfilled = settled.filter((result) => result.status === "fulfilled");
  const rejected = settled.filter((result) => result.status === "rejected");
  expect(fulfilled).toHaveLength(1);
  expect(rejected).toHaveLength(1);
  expect(rejected[0]?.status === "rejected" && rejected[0].reason).toBeInstanceOf(ApiConflictError);
  expect(rejected[0]?.status === "rejected" ? rejected[0].reason.message : "").toContain(
    "Alert rule limit reached",
  );
  expect(await ruleCount()).toBe(MAX_ALERT_RULES_PER_PROJECT);
});

it("rejects a sequential create once the project is at the cap", async () => {
  await seedRules(MAX_ALERT_RULES_PER_PROJECT - 1);
  const context = { actorId: userId, projectId };
  await createAlertRuleRecord(input(), context);
  expect(await ruleCount()).toBe(MAX_ALERT_RULES_PER_PROJECT);
  await expect(createAlertRuleRecord(input(), context)).rejects.toThrow("Alert rule limit reached");
  expect(await ruleCount()).toBe(MAX_ALERT_RULES_PER_PROJECT);
});
