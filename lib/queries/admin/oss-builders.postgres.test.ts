import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  actor: "actor" as string | null,
  cache: new Map<string, string>(),
}));
vi.mock("@/lib/auth/session", () => ({
  getSession: async () =>
    state.actor ? { user: { id: state.actor, twoFactorEnabled: true } } : null,
}));
vi.mock("@/lib/redis/redis", () => ({
  getRedisClient: async () => ({ get: async (key: string) => state.cache.get(key) ?? null }),
}));
vi.mock("@/lib/api/ratelimit", () => ({ consume: async () => ({ success: true }) }));

import { getOssAccount, getOssAccounts } from "./oss-accounts";
import { registerAccountCases } from "./oss-accounts.postgres.test-fixture";
import { getOssAudit } from "./oss-audit";
import { getOssEmailSending, getOssEmailSettings } from "./oss-email";
import {
  getOssChecks,
  getOssDataSources,
  getOssNotifications,
  getOssOverview,
  getOssWorker,
} from "./oss-operations";
import { ago, clearFixture, db, now, publicId, seedFixture } from "./oss-postgres.test-fixture";
import { getOssTasks } from "./oss-tasks";

const url = new URL(process.env.DATABASE_URL ?? "");
if (
  !["127.0.0.1", "localhost"].includes(url.hostname) ||
  url.port === "5440" ||
  !url.pathname.endsWith("_fixture") ||
  !url.searchParams.get("schema") ||
  url.searchParams.get("schema") === "public" ||
  process.env.DIRECT_URL !== url.toString()
) {
  throw new Error(
    "OSS admin tests require matching disposable loopback DATABASE_URL/DIRECT_URL with a non-public schema.",
  );
}
beforeAll(async () => {
  vi.stubEnv("SCHEDULER_DRIVER", "worker");
  vi.stubEnv("DEPLOYMENT_MODE", "self-host");
  vi.stubEnv("SITE_URL", "https://instance.example.com");
  vi.stubEnv("METERING_NAMESPACE", "admin-fixture");
  vi.stubEnv("EMAIL_PROVIDER", "");
  vi.stubEnv("EMAIL_FROM", "");
  vi.stubEnv("EMAIL_DAILY_BUDGET_BULK", "100");
  vi.stubEnv("EMAIL_DAILY_BUDGET_TRANSACTIONAL", "50");
  vi.stubEnv("BISIBILITY_SECRETS_KEY", Buffer.alloc(32, 1).toString("base64"));
  await seedFixture();
});
beforeEach(() => {
  state.actor = "actor";
});
afterAll(async () => {
  await clearFixture();
  await db.$disconnect();
  vi.unstubAllEnvs();
});

registerAccountCases();

it("returns rank windows, breakdowns, URL presence and status without business stats", async () => {
  const result = await getOssChecks(now);
  expect(result?.data.availability.rankChecks).toBe(true);
  expect(result?.data.rank24h).toMatchObject({ succeeded: 1, failed: 1, deferred: 1 });
  expect(result?.data.rank7d).toMatchObject({ succeeded: 2, failed: 1, deferred: 1 });
  expect(result?.data.rank24h.failureBreakdown.groups).toHaveLength(1);
  expect(result?.data.rank24h.fallbackBreakdown.groups).toHaveLength(1);
  expect(result?.data.presence).toEqual({
    affectedProjects: 2,
    deferred: 7,
    occurredAt: ago(1).toISOString(),
  });
  expect(result?.data).not.toHaveProperty("stats");
  const overview = await getOssOverview(now);
  expect(overview?.emailAllowance.status).toBe("available");
});
it("reads data source health and notification delivery state from persisted operations", async () => {
  const data = await getOssDataSources(now);
  expect(data?.data.providerHealth).toEqual([
    {
      provider: "fixture-analytics",
      failed: 0,
      failureRatePercent: 0,
      notRun: 0,
      ok: 1,
      stale: 0,
      p95AgeMs: 1_800_000,
    },
  ]);
  const result = await getOssNotifications(now);
  expect(result?.data.ops.undeliveredCount).toBe(1);
  expect(result?.data.ops.events).toHaveLength(2);
  expect(result?.data.ops.events[1]).toMatchObject({
    attempts: 1,
    deliveredAt: ago(1).toISOString(),
    severity: "info",
  });
});
it("reads worker and Temporal snapshots with schema, schedules and presence diagnostics", async () => {
  state.cache.set(
    "ops:worker:lastSeen",
    JSON.stringify({
      lastSeenAt: ago(0.01).toISOString(),
      environment: "fixture",
      release: "1.0.0",
      revision: "fixed",
      schedulerDriver: "worker",
      schedulerMode: "dispatcher",
      schemaComparison: "ok",
      appliedMigration: "fixture-migration",
      bundledMigration: "fixture-migration",
    }),
  );
  state.cache.set(
    "ops:temporal:snapshot",
    JSON.stringify({
      collectedAt: now.toISOString(),
      heartbeat: {
        schedules: 3,
        recentActions: 2,
        nextActionAt: ago(-1).toISOString(),
        inspectionErrors: 0,
        issueSchedules: ["presence"],
        missedCatchupTotal: 1,
        skippedOverlapTotal: 2,
        scheduleIssues: [
          {
            scheduleId: "presence",
            gapAt: ago(2).toISOString(),
            missedCatchup: 1,
            recoveredAt: null,
            skippedOverlap: 2,
          },
        ],
        indexingSchedule: { paused: false, nextActionTimes: [ago(-1).toISOString()] },
      },
    }),
  );
  const result = await getOssWorker(now);
  expect(result?.data.worker).toMatchObject({
    status: "ok",
    heartbeatState: "fresh",
    release: "1.0.0",
    schemaComparison: "ok",
  });
  expect(result?.data.temporal).toMatchObject({
    status: "ok",
    heartbeat: {
      schedules: 3,
      missedCatchupTotal: 1,
      skippedOverlapTotal: 2,
      indexingSchedule: { paused: false },
    },
  });
  state.cache.clear();
});
it("returns email allowance for today and secret-free mail settings", async () => {
  const result = await getOssEmailSending(now);
  expect(result?.allowance.categories).toEqual([
    { category: "bulk", limit: 100, reservedAttempts: 12, remaining: 88 },
    { category: "transactional", limit: 50, reservedAttempts: 8, remaining: 42 },
  ]);
  const settings = await getOssEmailSettings();
  expect(settings).toMatchObject({
    mailerConfigured: true,
    mailSettings: {
      credentialsConfigured: true,
      provider: "smtp",
      sender: "robot@example.com",
      twoFactorEnabled: true,
      envOverridesSaved: false,
    },
  });
  expect(JSON.stringify(settings)).not.toMatch(/credentialsCipher|smtpPassword|smtpHost/);
});
it("returns recovery empty state and actual stalled task details without money", async () => {
  expect((await getOssTasks({}, now))?.page.rows).toEqual([]);
  await db.rankCheck.update({
    where: { id: "check-2" },
    data: { status: "running", updatedAt: ago(1) },
  });
  const result = await getOssTasks({ category: "unfinished", provider: "all" }, now);
  expect(
    await db.auditLog.count({ where: { action: "instance_admin.metering_recovery_viewed" } }),
  ).toBe(2);
  expect(
    (await getOssAudit({ filter: "ops" }))?.entries.some(
      (row) => row.action === "instance_admin.metering_recovery_viewed",
    ),
  ).toBe(true);
  expect(result?.page.summary.unfinished).toBe(1);
  expect(result?.page.rows).toHaveLength(1);
  expect(result?.page.rows[0]).toMatchObject({
    kind: "check",
    work: "unfinished",
    project: publicId("prj", 1),
    accounting: "not_applicable",
    token: expect.any(String),
    triage: { status: "open" },
  });
  expect(JSON.stringify(result)).not.toMatch(/maxCostCents|monthlySpend|originalAuthorization/);
  await db.rankCheck.update({
    where: { id: "check-2" },
    data: { status: "failed", updatedAt: ago(1) },
  });
});
it("filters audit categories before cursor paging, including ties, and excludes business actions", async () => {
  await db.auditLog.deleteMany();
  await db.auditLog.createMany({
    data: Array.from({ length: 30 }, (_, i) => ({
      publicId: publicId("audit", i + 1),
      actorId: "actor",
      action: "instance_admin.ops_test",
      targetId: "instance",
      targetType: "instance_ops",
      createdAt: now,
      status: i === 29 ? "failed" : "success",
      statusReason: i === 29 ? "Guard blocked" : null,
    })),
  });
  await db.auditLog.createMany({
    data: ["account_viewed", "first_run_completed", "announcement_created", "metering_rebuilt"].map(
      (action, i) => ({
        publicId: publicId("audit", 40 + i),
        actorId: "actor",
        action: `instance_admin.${action}`,
        targetId: "instance",
        targetType: "instance_ops",
        createdAt: now,
      }),
    ),
  });
  const first = await getOssAudit({ filter: "ops" });
  expect(first?.entries).toHaveLength(25);
  expect(first?.entries[0]).toMatchObject({ actor: "admin@example.com", result: "blocked" });
  const second = await getOssAudit({ filter: "ops", cursor: first?.nextCursor });
  expect(second?.entries).toHaveLength(5);
  expect(
    new Set([...(first?.entries ?? []), ...(second?.entries ?? [])].map((row) => row.id)).size,
  ).toBe(30);
  expect(second?.nextCursor).toBeUndefined();
  expect((await getOssAudit({ filter: "account" }))?.entries).toHaveLength(1);
  expect((await getOssAudit({ filter: "setup" }))?.entries).toHaveLength(1);
  const all = await getOssAudit();
  expect(all?.entries.some((row) => /announcement|metering/.test(row.action))).toBe(false);
  await expect(getOssAudit({ cursor: "malformed" })).rejects.toThrow();
});
it("checks the actual admin flag for every builder", async () => {
  const entries = [
    () => getOssAccounts(),
    () => getOssAccount("alice@example.com"),
    () => getOssAudit(),
    () => getOssEmailSending(now),
    () => getOssEmailSettings(),
    () => getOssTasks({}, now),
    ...[getOssOverview, getOssWorker, getOssChecks, getOssDataSources, getOssNotifications].map(
      (fn) => () => fn(now),
    ),
  ];
  state.actor = null;
  for (const entry of entries) expect(await entry()).toBeNull();
  state.actor = "alice";
  for (const entry of entries) await expect(entry()).rejects.toMatchObject({ code: "forbidden" });
});
it("returns honest empty states for every page", async () => {
  await clearFixture();
  await db.user.create({
    data: {
      id: "actor",
      publicId: publicId("usr", 1),
      name: "Admin",
      email: "admin@example.com",
      isInstanceAdmin: true,
    },
  });
  const checks = await getOssChecks(now);
  expect(checks?.data.rank24h).toMatchObject({ failed: 0, succeeded: 0, deferred: 0 });
  expect(checks?.data.presence).toBeNull();
  expect((await getOssDataSources(now))?.data.providerHealth).toEqual([]);
  expect((await getOssNotifications(now))?.data.ops.events).toEqual([]);
  expect((await getOssWorker(now))?.data.worker.heartbeatState).toBe("absent");
  expect((await getOssOverview(now))?.emailAllowance.status).toBe("not_configured");
  expect((await getOssAccounts({ search: "missing" }))?.accounts).toEqual([]);
  expect((await getOssAudit())?.entries).toEqual([]);
  expect((await getOssTasks({}, now))?.page.rows).toEqual([]);
  expect((await getOssEmailSending(now))?.allowance.categories).toEqual([]);
  expect((await getOssEmailSettings())?.mailSettings.credentialsConfigured).toBe(false);
});
