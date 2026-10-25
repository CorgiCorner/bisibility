import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import shellMessages from "@/messages/core/en/shell.json";
import { prisma } from "@/lib/db/prisma";
import { closeProjectIncidentsSilently } from "@/lib/notifications/close-project-incidents";
import {
  changeDimensions,
  enqueueIncident,
  incidentFixture,
  resolvedDimensions,
} from "@/lib/provider-evidence/incidents/postgres.test-support";
import { assertRecoveryFixtureUrl } from "@/lib/provider-evidence/recovery/fixture-url.test-support";
import {
  cleanRecoveryFixtures,
  fixtureNamespace,
} from "@/lib/provider-evidence/recovery/postgres.test-support";
import { loadRetainedRankReportTargets } from "@/lib/rank-reports/database";
import { RankReportSnapshotConflictError } from "@/lib/rank-reports/errors";
import { hostOrganicReportPolicy, RANK_REPORT_HOST_LIMITS } from "@/lib/rank-reports/host-policy";
import { collectWeeklyDigestData } from "./weekly-digest-data";
import { sendWeeklyDigestForProject } from "./weekly-digest-send";
const mocks = vi.hoisted(() => ({ send: vi.fn(), ops: vi.fn() }));
vi.mock("@/lib/email/send", () => ({ sendEmail: mocks.send }));
vi.mock("@/lib/ops/notify", () => ({ notifyOps: mocks.ops }));
const url = process.env.METERING_TEST_DATABASE_URL;
const day = 86_400_000;
async function fixture() {
  const f = await incidentFixture();
  await prisma.user.update({ where: { id: f.user.id }, data: { emailVerified: true } });
  const incident = await enqueueIncident(f);
  const end = new Date(Date.now() + 60_000);
  return { ...f, incident, end, start: new Date(end.getTime() - 7 * day) };
}

describe.skipIf(!url)("weekly digest attention PostgreSQL", () => {
  beforeEach(() => {
    assertRecoveryFixtureUrl(url);
    vi.resetAllMocks();
    mocks.send.mockResolvedValue(undefined);
    vi.stubEnv("EMAIL_PROVIDER", "");
    vi.stubEnv("METERING_NAMESPACE", fixtureNamespace);
    vi.stubEnv("PROVIDER_RECOVERY", "on");
    vi.stubEnv("BISIBILITY_SECRETS_KEY", Buffer.alloc(32, 7).toString("base64"));
  });
  afterEach(async () => {
    await cleanRecoveryFixtures();
    vi.unstubAllEnvs();
  });
  afterAll(() => prisma.$disconnect());

  it("WD-2 includes transitions inside the half-open period and omits unchanged incidents and watermarked transitions", async () => {
    const f = await fixture();
    expect(await collectWeeklyDigestData(f.project.id, f.end, true)).toMatchObject({
      incidentOnly: true,
      attention: [{ change: "New" }],
    });
    await prisma.providerIncidentTransition.updateMany({
      where: { incidentId: f.incident.id },
      data: { createdAt: new Date(f.start.getTime() - 1) },
    });
    expect(await collectWeeklyDigestData(f.project.id, f.end, true)).toBeNull();
    await prisma.providerIncidentTransition.updateMany({
      where: { incidentId: f.incident.id },
      data: { createdAt: f.end },
    });
    expect(await collectWeeklyDigestData(f.project.id, f.end, true)).toBeNull();
    await prisma.providerIncidentTransition.updateMany({
      where: { incidentId: f.incident.id },
      data: { createdAt: f.start },
    });
    expect(await collectWeeklyDigestData(f.project.id, f.end, true)).not.toBeNull();
    await prisma.providerIncidentDeliveryWatermark.create({
      data: { projectId: f.project.id, deliveredThrough: new Date(f.start.getTime() + 1) },
    });
    expect(await collectWeeklyDigestData(f.project.id, f.end, true)).toBeNull();
  });

  it("WD-1 reads the latest pre-end snapshot rather than today's incident counts", async () => {
    const f = await fixture();
    await changeDimensions(f.operationPk, resolvedDimensions);
    await prisma.providerIncidentTransition.updateMany({
      where: { incidentId: f.incident.id, version: 2 },
      data: { createdAt: new Date(f.end.getTime() + 1) },
    });
    const data = await collectWeeklyDigestData(f.project.id, f.end, true);
    expect(data?.attention?.[0].body).toContain("1 result under review");
    expect(data?.attention?.[0].body).not.toContain("recovered result");
  });

  it("WD-3/6 sends one attention-only email per recipient only when opted in", async () => {
    const f = await fixture();
    vi.stubEnv("PROVIDER_RECOVERY", "observe");
    expect(await sendWeeklyDigestForProject(f.project.id, f.end)).toEqual({
      status: "skipped",
      reason: "no_activity",
    });
    expect(mocks.send).not.toHaveBeenCalled();
    vi.stubEnv("PROVIDER_RECOVERY", "on");
    expect(await sendWeeklyDigestForProject(f.project.id, f.end)).toMatchObject({
      recipients: 1,
      failed: 0,
    });
    expect(mocks.send).toHaveBeenCalledTimes(1);
    const mail = mocks.send.mock.calls[0][0];
    expect(mail.text).toContain(shellMessages.shell.notifications.incident.noRepeat);
    expect(mail.text).toContain(`/app/${f.project.publicId}/runs`);
    for (const value of [
      "Top movers",
      "Average delta",
      "Failed checks",
      "Expected keywords",
      f.incident.id,
      f.operationPk,
      "dataforseo",
    ])
      expect(mail.text).not.toContain(value);
  });

  it("WD-4 restored checks alone do not open the gate or enter quality statistics and movers", async () => {
    const f = await fixture();
    await prisma.rankCheck.update({
      where: { id: f.check.id },
      data: { recoveryRestoredAt: new Date() },
    });
    const before = await collectWeeklyDigestData(f.project.id, f.end, true);
    await prisma.rankCheck.update({
      where: { id: f.check.id },
      data: {
        status: "completed",
        position: 1,
        recoveryRestoredAt: new Date(),
        finishedAt: f.check.checkedAt,
      },
    });
    const after = await collectWeeklyDigestData(f.project.id, f.end, true);
    expect(after?.quality).toEqual(before?.quality);
    expect(after?.topMovers).toEqual(before?.topMovers);
    expect(after?.checkedKeywords).toBe(before?.checkedKeywords);
    expect(after?.incidentOnly).toBe(true);
    expect(await collectWeeklyDigestData(f.project.id, f.end, false)).toBeNull();
    expect(await sendWeeklyDigestForProject(f.project.id, f.end, false)).toEqual({
      status: "skipped",
      reason: "no_activity",
    });
  });

  it("WD-4 excludes restores persisted after periodEnd before retained snapshot validation", async () => {
    const f = await fixture();
    const end = new Date(Date.now() - 1);
    const restored = await prisma.rankCheck.update({
      where: { id: f.check.id },
      data: { status: "completed", position: 1, recoveryRestoredAt: new Date() },
    });
    expect(restored.updatedAt.getTime()).toBeGreaterThan(end.getTime());
    await expect(
      prisma.$transaction((tx) =>
        loadRetainedRankReportTargets(
          tx,
          { project: f.project, keywords: [f.keyword] },
          hostOrganicReportPolicy(new Date(end.getTime() - 1)),
          RANK_REPORT_HOST_LIMITS,
          new Map(),
          false,
        ),
      ),
    ).rejects.toBeInstanceOf(RankReportSnapshotConflictError);
    expect(await collectWeeklyDigestData(f.project.id, end, false)).toBeNull();
    expect(await sendWeeklyDigestForProject(f.project.id, end, false)).toEqual({
      status: "skipped",
      reason: "no_activity",
    });
    expect(mocks.send).not.toHaveBeenCalled();
    expect(await prisma.weeklyDigestSend.count({ where: { projectId: f.project.id } })).toBe(0);
  });

  it("WD-1 excludes incident-linked failed checks only with the switch on, including public/internal ID mapping", async () => {
    const f = await fixture();
    await prisma.rankCheck.update({ where: { id: f.check.id }, data: { status: "failed" } });
    expect(await collectWeeklyDigestData(f.project.id, f.end, false)).toMatchObject({
      failedChecksCount: 1,
    });
    expect(await collectWeeklyDigestData(f.project.id, f.end, true)).toMatchObject({
      failedChecksCount: 0,
    });
    await prisma.providerRecoveryCandidate.updateMany({
      where: { operationPk: f.operationPk },
      data: { accountingOnly: true },
    });
    expect(await collectWeeklyDigestData(f.project.id, f.end, true)).toMatchObject({
      failedChecksCount: 1,
    });
  });

  it("DM-15 uses frozen customer evidence for an accounting-only fallback winner", async () => {
    const f = await fixture();
    await changeDimensions(f.operationPk, { fulfillment: "complete", accounting: "conflict" });
    await prisma.providerRecoveryIntent.updateMany({
      where: { operationPk: f.operationPk },
      data: { accountingOnly: true },
    });
    await changeDimensions(f.operationPk, { accounting: "measured" });
    const data = await collectWeeklyDigestData(f.project.id, f.end, true);
    expect(data?.attention?.[0].body).toContain("1 recovered result");
    expect(data?.attention?.[0].body).toContain("cost conflict for 1 check");
    expect(data?.attention?.[0].body).not.toContain("cost measured");
  });

  it("silent project retirement and deletion produce no digest, transition or watermark", async () => {
    const f = await fixture();
    const count = await prisma.providerIncidentTransition.count({
      where: { incidentId: f.incident.id },
    });
    await prisma.$transaction(async (tx) => {
      await closeProjectIncidentsSilently(tx, f.project.id);
      await tx.project.update({ where: { id: f.project.id }, data: { writeMode: "migrated" } });
    });
    expect(await collectWeeklyDigestData(f.project.id, f.end, true)).toBeNull();
    expect(
      await prisma.providerIncidentTransition.count({ where: { incidentId: f.incident.id } }),
    ).toBe(count);
    expect(
      await prisma.providerIncidentDeliveryWatermark.count({ where: { projectId: f.project.id } }),
    ).toBe(0);
    await prisma.project.delete({ where: { id: f.project.id } });
    expect(await collectWeeklyDigestData(f.project.id, f.end, true)).toBeNull();
    expect(mocks.send).not.toHaveBeenCalled();
  });
});
