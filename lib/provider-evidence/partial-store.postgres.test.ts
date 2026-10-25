import { readFileSync } from "node:fs";
import { PrismaClient } from "@/lib/generated/prisma/client";
import { maintainRetainedRankResults } from "@/lib/rank-check/recovery-maintenance";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import { afterEach, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  prisma: {} as Record<string, unknown>,
  restore: vi.fn(async () => false),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/metering/recovery/tokens", () => ({ recoveryInstance: () => "inst" }));
vi.mock("@/lib/metering/runtime", () => ({ meteringNamespace: () => "ns" }));
vi.mock("@/lib/rank-check/recovery-evidence", () => ({
  RetainedRankResultUnreadableError: class extends Error {},
}));
vi.mock("@/lib/rank-check/recovery-restore", () => ({ restoreRetainedRankResult: mocks.restore }));
vi.mock("@/lib/rank-check/recovery-result-health", () => ({ saveResultRecoveryHealth: vi.fn() }));

afterEach(() => vi.unstubAllEnvs());

test("maintenance and console relation cannot see partial/unresolved evidence during or after insert", async () => {
  vi.stubEnv("PROVIDER_RECOVERY", "on");
  const value = process.env.METERING_TEST_DATABASE_URL;
  if (!value || !["localhost", "127.0.0.1"].includes(new URL(value).hostname)) {
    throw new Error("METERING_TEST_DATABASE_URL must point at disposable loopback PostgreSQL.");
  }
  const schema = `partial_store_${process.pid}`;
  const writer = new pg.Client({ connectionString: value });
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: value }, { schema }) });
  await writer.connect();
  await writer.query(`CREATE SCHEMA ${schema}`);
  try {
    await writer.query(`SET search_path TO ${schema}`);
    await writer.query(`
      CREATE TYPE "NotificationType" AS ENUM ('system');
      CREATE TABLE users (id text PRIMARY KEY);
      CREATE TABLE projects (id text PRIMARY KEY);
      CREATE TABLE metering_operation (operation_pk text PRIMARY KEY);
      CREATE TABLE metering_receipt (operation_pk text, sequence int, cost_certainty text);
      CREATE TABLE rank_checks (id text PRIMARY KEY);
      CREATE TABLE rank_check_runs (id text PRIMARY KEY);
      CREATE TABLE notifications (id text PRIMARY KEY);
      CREATE TABLE notification_preferences (id text PRIMARY KEY);
      CREATE TABLE rank_check_result_evidence (
        namespace text, "instanceId" text, "rankCheckId" text PRIMARY KEY,
        "identityHash" text, "payloadEncrypted" text, "schemaVersion" int DEFAULT 1,
        "blockedCode" text, "expiresAt" timestamptz, "createdAt" timestamptz
      );
      INSERT INTO rank_checks VALUES ('legacy'), ('partial'), ('unresolved');
      INSERT INTO rank_check_result_evidence VALUES ('ns', 'inst', 'legacy', 'hash', 'cipher', 1, NULL, '2026-10-24', '2026-10-22');
    `);
    await writer.query(
      readFileSync(
        new URL(
          "../../prisma/migrations/20261023203000_provider_evidence_data_model/migration.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    mocks.prisma.rankCheckResultEvidence = db.rankCheckResultEvidence;
    mocks.prisma.providerPartialEvidence = db.providerPartialEvidence;
    mocks.prisma.$transaction = async (callback: (tx: unknown) => Promise<unknown>) => callback(db);
    const observe = async () => {
      mocks.restore.mockClear();
      await maintainRetainedRankResults(new Date("2026-10-23T12:00:00Z"));
      expect(mocks.restore.mock.calls.map((call) => (call as unknown[])[1])).toEqual(["legacy"]);
      for (const id of ["partial", "unresolved"]) {
        expect(
          await db.rankCheck.findUnique({ where: { id }, select: { recoveryResult: true } }),
        ).toEqual({ recoveryResult: null });
      }
    };
    await writer.query("BEGIN");
    await writer.query(`INSERT INTO provider_partial_evidence
      (id, namespace, "instanceId", "rankCheckId", kind, "payloadEncrypted", "identityHash", "expiresAt")
      VALUES ('partial', 'ns', 'inst', 'partial', 'partial', 'cipher', 'hash', '2026-10-24'),
             ('unresolved', 'ns', 'inst', 'unresolved', 'unresolved', 'cipher', 'hash', '2026-10-24')`);
    await observe();
    await writer.query("COMMIT");
    await observe();
  } finally {
    await writer.query("ROLLBACK");
    await db.$disconnect();
    await writer.query(`DROP SCHEMA ${schema} CASCADE`);
    await writer.end();
  }
});
