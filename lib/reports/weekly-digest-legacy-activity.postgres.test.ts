import type { ReportSummary } from "@/lib/rank-reports/model";
import { prisma } from "@/lib/db/prisma";
import { makePublicId } from "@/lib/db/public-id";
import { EmailNotSubmittedError } from "@/lib/email/types";
import { incidentFixture } from "@/lib/provider-evidence/incidents/postgres.test-support";
import { assertRecoveryFixtureUrl } from "@/lib/provider-evidence/recovery/fixture-url.test-support";
import { cleanRecoveryFixtures, fixtureNamespace } from "@/lib/provider-evidence/recovery/postgres.test-support";
import { sendWeeklyReportDigestActivity } from "@/lib/temporal/weekly-digest-activity";
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WeeklyDigestData } from "./weekly-digest-data";

const scheduled = Date.parse("2026-10-24T06:15:00Z");
const mocks = vi.hoisted(() => ({ send: vi.fn(), collect: vi.fn(), projectId: "" }));
vi.mock("@temporalio/activity", () => ({
  Context: { current: () => ({ info: {
    scheduledTimestampMs: Date.parse("2026-10-24T06:15:00Z"),
    currentAttemptScheduledTimestampMs: Date.now(),
  } }) },
}));
vi.mock("@/lib/email/send", () => ({ sendEmail: mocks.send }));
vi.mock("@/lib/ops/notify", () => ({ notifyOps: vi.fn() }));
vi.mock("./weekly-digest-data", () => ({ collectWeeklyDigestData: mocks.collect }));
const url = process.env.METERING_TEST_DATABASE_URL;
const extraUsers: string[] = [];

describe.skipIf(!url)("legacy no-argument digest activity idempotency", () => {
  beforeEach(() => {
    assertRecoveryFixtureUrl(url);
    vi.resetAllMocks();
    mocks.projectId = "";
    vi.stubEnv("METERING_NAMESPACE", fixtureNamespace);
    vi.stubEnv("BISIBILITY_SECRETS_KEY", Buffer.alloc(32, 7).toString("base64"));
    mocks.send.mockResolvedValue(undefined);
    // Only this project has synthetic digest data; enumeration and send claims stay native.
    mocks.collect.mockImplementation(async (projectId: string) => projectId === mocks.projectId ? {
      projectName: "Fixture", projectDomain: "example.test",
      rangeStart: new Date(scheduled - 7 * 86400000), rangeEnd: new Date(scheduled),
      avgPositionDelta: null, checkedKeywords: 1, failedChecksCount: 0, topMovers: [],
      quality: { metric: { counts: { expected: 1, comparable: 0, unknown: 1 }, dataCoverage: 0 } } as ReportSummary,
      membership: { archived: "excluded", pausedMarkets: "excluded", pausedSchedules: "include_retained" },
    } satisfies WeeklyDigestData : null);
  });
  afterEach(async () => {
    vi.useRealTimers();
    await cleanRecoveryFixtures();
    await prisma.user.deleteMany({ where: { id: { in: extraUsers.splice(0) } } });
    vi.unstubAllEnvs();
  });
  afterAll(() => prisma.$disconnect());

  it.each(["sent", "ambiguous"] as const)("retries the safe failure without resubmitting the %s recipient", async (first) => {
    // Exercise both insertion orders without depending on the global project query order.
    const before = first === "sent" ? await incidentFixture() : null;
    const f = await incidentFixture();
    const sentinel = before ?? await incidentFixture();
    mocks.projectId = f.project.id;
    await prisma.user.update({ where: { id: f.user.id }, data: { emailVerified: true } });
    await prisma.user.update({ where: { id: sentinel.user.id }, data: { emailVerified: true } });
    const member = await prisma.user.create({ data: {
      publicId: makePublicId("usr"), name: "Member", email: `${randomUUID()}@example.test`, emailVerified: true,
    } });
    extraUsers.push(member.id);
    await prisma.membership.create({ data: { publicId: makePublicId("mbr"), projectId: f.project.id, userId: member.id } });
    if (first === "sent") mocks.send.mockResolvedValueOnce(undefined);
    else mocks.send.mockRejectedValueOnce(new Error("Native handoff outcome unknown"));
    mocks.send.mockRejectedValueOnce(new EmailNotSubmittedError(new Error("preflight")));
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(scheduled + 60_000));
    await expect(sendWeeklyReportDigestActivity()).rejects.toThrow("retryable failures");
    vi.setSystemTime(new Date(scheduled + 3600_000));
    await sendWeeklyReportDigestActivity();
    expect(mocks.send.mock.calls.map(([input]) => input.to)).toEqual([f.user.email, member.email, member.email]);
    const records = await prisma.weeklyDigestSend.findMany({ where: { projectId: f.project.id }, orderBy: { attempts: "asc" } });
    expect(records).toHaveLength(2);
    expect(records.map((row) => row.periodEnd.getTime())).toEqual([scheduled, scheduled]);
    expect(records.map((row) => row.attempts)).toEqual([1, 2]);
    expect(records[0].status).toBe(first);
    expect(mocks.collect.mock.calls.filter(([projectId]) => projectId === sentinel.project.id)).toHaveLength(2);
    expect(mocks.send.mock.calls.some(([input]) => input.to === sentinel.user.email)).toBe(false);
    expect(await prisma.weeklyDigestSend.count({ where: { projectId: sentinel.project.id } })).toBe(0);
  });
});
