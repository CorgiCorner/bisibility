import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { makePublicId } from "@/lib/db/public-id";
import { EmailNotSubmittedError, EmailProviderUnavailableError } from "@/lib/email/types";
import { assertRecoveryFixtureUrl } from "@/lib/provider-evidence/recovery/fixture-url.test-support";
import {
  cleanRecoveryFixtures,
  fixtureNamespace,
} from "@/lib/provider-evidence/recovery/postgres.test-support";
import { incidentFixture } from "@/lib/provider-evidence/incidents/postgres.test-support";
import { claimDigest } from "./weekly-digest-records";
import { weeklyDigestPeriod } from "./weekly-digest-period";
import { sendWeeklyDigestForProject } from "./weekly-digest-send";
import type { ReportSummary } from "@/lib/rank-reports/model";
import type { WeeklyDigestData } from "./weekly-digest-data";
const mocks = vi.hoisted(() => ({ send: vi.fn(), collect: vi.fn(), ops: vi.fn() }));
vi.mock("@/lib/email/send", () => ({ sendEmail: mocks.send }));
vi.mock("@/lib/ops/notify", () => ({ notifyOps: mocks.ops }));
vi.mock("./weekly-digest-data", () => ({ collectWeeklyDigestData: mocks.collect }));
const url = process.env.METERING_TEST_DATABASE_URL;
const extraUsers: string[] = [];
const periodEnd = new Date("2026-10-24T06:15:00Z");
const period = weeklyDigestPeriod(periodEnd);
const data: WeeklyDigestData = {
  projectName: "Fixture",
  projectDomain: "example.test",
  rangeStart: period.periodStart,
  rangeEnd: periodEnd,
  avgPositionDelta: null,
  checkedKeywords: 1,
  failedChecksCount: 0,
  topMovers: [],
  quality: {
    metric: { counts: { expected: 1, comparable: 0, unknown: 1 }, dataCoverage: 0 },
  } as ReportSummary,
  membership: {
    archived: "excluded",
    pausedMarkets: "excluded",
    pausedSchedules: "include_retained",
  },
};
async function fixture() {
  const f = await incidentFixture();
  await prisma.user.update({ where: { id: f.user.id }, data: { emailVerified: true } });
  const member = await prisma.user.create({
    data: {
      publicId: makePublicId("usr"),
      email: `${randomUUID()}@example.test`,
      name: "Member",
      emailVerified: true,
    },
  });
  extraUsers.push(member.id);
  await prisma.membership.create({
    data: { publicId: makePublicId("mbr"), projectId: f.project.id, userId: member.id },
  });
  return { ...f, member };
}
async function records(projectId: string) {
  return prisma.weeklyDigestSend.findMany({ where: { projectId }, orderBy: { sentAt: "asc" } });
}

describe.skipIf(!url)("weekly digest recipient records PostgreSQL", () => {
  beforeEach(() => {
    assertRecoveryFixtureUrl(url);
    vi.resetAllMocks();
    vi.stubEnv("METERING_NAMESPACE", fixtureNamespace);
    vi.stubEnv("EMAIL_PROVIDER", "");
    vi.stubEnv("BISIBILITY_SECRETS_KEY", Buffer.alloc(32, 7).toString("base64"));
    mocks.collect.mockResolvedValue(data);
    mocks.send.mockResolvedValue(undefined);
  });
  afterEach(async () => {
    await cleanRecoveryFixtures();
    await prisma.user.deleteMany({ where: { id: { in: extraUsers.splice(0) } } });
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });
  afterAll(() => prisma.$disconnect());

  it("DM-11 retries the failed second recipient without resending the first", async () => {
    const f = await fixture();
    mocks.send
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new EmailNotSubmittedError(new Error("preflight")));
    expect(await sendWeeklyDigestForProject(f.project.id, periodEnd, false)).toMatchObject({
      failed: 1,
      recipients: 1,
    });
    expect((await records(f.project.id)).map((row) => row.status)).toEqual(["sent", "failed"]);
    expect(
      await prisma.auditLog.count({
        where: { projectId: f.project.id, action: "report.weekly_digest_sent" },
      }),
    ).toBe(0);
    expect(await sendWeeklyDigestForProject(f.project.id, periodEnd, false)).toMatchObject({
      failed: 0,
      recipients: 2,
    });
    expect(mocks.send.mock.calls.map(([input]) => input.to)).toEqual([
      f.user.email,
      f.member.email,
      f.member.email,
    ]);
    expect((await records(f.project.id)).map((row) => row.attempts)).toEqual([1, 2]);
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { projectId: f.project.id, action: "report.weekly_digest_sent" },
    });
    expect(audit.after).toMatchObject({
      sent: 2,
      ambiguous: 0,
      periodEnd: periodEnd.toISOString(),
    });
  });

  it("concurrent runs hand each recipient to the fake transport at most once", async () => {
    const f = await fixture();
    await Promise.all([
      sendWeeklyDigestForProject(f.project.id, periodEnd, false),
      sendWeeklyDigestForProject(f.project.id, periodEnd, false),
    ]);
    expect(mocks.send).toHaveBeenCalledTimes(2);
    expect(new Set(mocks.send.mock.calls.map(([input]) => input.to)).size).toBe(2);
    expect(
      await prisma.auditLog.count({
        where: { projectId: f.project.id, action: "report.weekly_digest_sent" },
      }),
    ).toBe(1);
  });

  it.each(["claimed", "ambiguous"] as const)(
    "never resends an existing %s recipient and reports reconciliation",
    async (status) => {
      const f = await fixture();
      await prisma.weeklyDigestSend.create({
        data: { ...period, projectId: f.project.id, userId: f.user.id, status },
      });
      expect(await sendWeeklyDigestForProject(f.project.id, periodEnd, true)).toMatchObject({
        ambiguous: 1,
        failed: 0,
      });
      expect(mocks.send).toHaveBeenCalledTimes(1);
      expect(mocks.send.mock.calls[0][0].to).toBe(f.member.email);
      expect((await records(f.project.id))[0]).toMatchObject({ status: "ambiguous", attempts: 1 });
      expect(mocks.ops).toHaveBeenCalledWith(
        expect.objectContaining({
          dedupeKey: `weekly-digest-ambiguous:${f.project.id}:${periodEnd.toISOString()}`,
        }),
      );
      expect(
        (
          await prisma.providerIncidentDeliveryWatermark.findUniqueOrThrow({
            where: { projectId: f.project.id },
          })
        ).deliveredThrough,
      ).toEqual(periodEnd);
    },
  );

  it.each(["membership", "preference", "verified", "deleted"] as const)(
    "rechecks %s after candidate listing and leaves no sent record",
    async (guard) => {
      const f = await fixture();
      mocks.collect.mockImplementationOnce(async () => {
        if (guard === "membership")
          await prisma.membership.deleteMany({ where: { userId: f.member.id } });
        if (guard === "preference")
          await prisma.notificationPreference.create({
            data: { userId: f.member.id, projectId: f.project.id, reportEmail: false },
          });
        if (guard === "verified")
          await prisma.user.update({ where: { id: f.member.id }, data: { emailVerified: false } });
        if (guard === "deleted") await prisma.user.delete({ where: { id: f.member.id } });
        return data;
      });
      await sendWeeklyDigestForProject(f.project.id, periodEnd, false);
      expect(mocks.send).toHaveBeenCalledTimes(1);
      expect(mocks.send.mock.calls[0][0].to).toBe(f.user.email);
      expect((await records(f.project.id)).map((row) => row.userId)).toEqual([f.user.id]);
    },
  );

  it("uses the newly read address and the shared default for a missing preference row", async () => {
    const f = await fixture();
    mocks.collect.mockImplementationOnce(async () => {
      await prisma.user.update({
        where: { id: f.member.id },
        data: { email: "changed@example.test" },
      });
      return data;
    });
    await sendWeeklyDigestForProject(f.project.id, periodEnd, false);
    expect(mocks.send).toHaveBeenCalledWith(
      expect.objectContaining({ to: "changed@example.test" }),
    );
  });

  it("keeps a network outcome ambiguous and never retries it", async () => {
    const f = await fixture();
    mocks.send.mockRejectedValueOnce(new Error("timeout"));
    await sendWeeklyDigestForProject(f.project.id, periodEnd, false);
    expect((await records(f.project.id))[0].status).toBe("ambiguous");
    await sendWeeklyDigestForProject(f.project.id, periodEnd, false);
    expect(mocks.send).toHaveBeenCalledTimes(2);
  });

  it("never moves a delivery watermark backwards when an older period finishes last", async () => {
    const f = await fixture();
    const later = new Date(periodEnd.getTime() + 86_400_000);
    await prisma.providerIncidentDeliveryWatermark.create({
      data: { projectId: f.project.id, deliveredThrough: later },
    });
    await sendWeeklyDigestForProject(f.project.id, periodEnd, true);
    expect(mocks.send).toHaveBeenCalledTimes(2);
    expect(
      (
        await prisma.providerIncidentDeliveryWatermark.findUniqueOrThrow({
          where: { projectId: f.project.id },
        })
      ).deliveredThrough,
    ).toEqual(later);
  });

  it("migration maps a pre-existing row to sent without changing its creation time", async () => {
    const sql = readFileSync(
      "prisma/migrations/20261025010000_weekly_digest_send_state/migration.sql",
      "utf8",
    );
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe("CREATE SCHEMA digest_migration_fixture");
      await tx.$executeRawUnsafe("SET LOCAL search_path TO digest_migration_fixture");
      await tx.$executeRawUnsafe(
        'CREATE TABLE weekly_digest_sends (id text, "sentAt" timestamp NOT NULL)',
      );
      await tx.$executeRawUnsafe(
        "INSERT INTO weekly_digest_sends VALUES ('old', '2026-10-01T00:00:00')",
      );
      for (const statement of sql.split(";").filter((part) => part.trim()))
        await tx.$executeRawUnsafe(statement);
      const rows = await tx.$queryRawUnsafe<
        Array<{ status: string; attempts: number; sentAt: Date }>
      >('SELECT status::text, attempts, "sentAt" FROM weekly_digest_sends');
      expect(rows[0]).toMatchObject({
        status: "sent",
        attempts: 1,
        sentAt: new Date("2026-10-01T00:00:00Z"),
      });
      await tx.$executeRawUnsafe("DROP SCHEMA digest_migration_fixture CASCADE");
    });
  });

  it("finalizes an all-skipped local period and never reclaims its recipient", async () => {
    vi.stubEnv("DEPLOYMENT_ENV", "development");
    vi.stubEnv("NODE_ENV", "test");
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const f = await fixture();
    await prisma.membership.deleteMany({ where: { projectId: f.project.id } });
    mocks.send.mockRejectedValue(
      new EmailNotSubmittedError(
        new EmailProviderUnavailableError("Email provider is unavailable."),
      ),
    );
    expect(await sendWeeklyDigestForProject(f.project.id, periodEnd, true)).toMatchObject({
      failed: 0,
      recipients: 0,
      skippedRecipients: 1,
    });
    const [row] = await records(f.project.id);
    expect(row).toMatchObject({
      status: "skipped",
      deliveredAt: null,
      lastErrorKind: "no_provider_local",
      attempts: 1,
    });
    expect(info).toHaveBeenCalledTimes(1);
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { projectId: f.project.id, action: "report.weekly_digest_sent" },
    });
    expect(audit.after).toMatchObject({ skipped: 1, sent: 0, ambiguous: 0 });
    expect(
      (
        await prisma.providerIncidentDeliveryWatermark.findUniqueOrThrow({
          where: { projectId: f.project.id },
        })
      ).deliveredThrough,
    ).toEqual(periodEnd);
    expect(await claimDigest({ ...period, projectId: f.project.id, userId: f.user.id })).toBe(
      false,
    );
    expect(await sendWeeklyDigestForProject(f.project.id, periodEnd, true)).toEqual({
      status: "skipped",
      reason: "recently_sent",
    });
    expect(mocks.send).toHaveBeenCalledTimes(1);
    expect(await records(f.project.id)).toEqual([row]);
    expect(mocks.ops).not.toHaveBeenCalled();
  });

  it("keeps production no-provider failures retryable and reclaims the next attempt", async () => {
    vi.stubEnv("DEPLOYMENT_ENV", "production");
    vi.stubEnv("NODE_ENV", "test");
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const f = await fixture();
    await prisma.membership.deleteMany({ where: { projectId: f.project.id } });
    mocks.send.mockRejectedValue(
      new EmailNotSubmittedError(
        new EmailProviderUnavailableError("Email provider is unavailable."),
      ),
    );
    for (const attempts of [1, 2]) {
      expect(await sendWeeklyDigestForProject(f.project.id, periodEnd, true)).toMatchObject({
        failed: 1,
        skippedRecipients: 0,
      });
      expect(await records(f.project.id)).toEqual([
        expect.objectContaining({ status: "failed", lastErrorKind: "not_submitted", attempts }),
      ]);
      expect(
        await prisma.auditLog.count({
          where: { projectId: f.project.id, action: "report.weekly_digest_sent" },
        }),
      ).toBe(0);
      expect(
        await prisma.providerIncidentDeliveryWatermark.count({
          where: { projectId: f.project.id },
        }),
      ).toBe(0);
    }
    expect(mocks.send).toHaveBeenCalledTimes(2);
    expect(info).not.toHaveBeenCalled();
  });
});
