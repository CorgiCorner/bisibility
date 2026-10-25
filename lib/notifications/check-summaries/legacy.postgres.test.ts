import { prisma } from "@/lib/db/prisma";
import {
  notifyRankCheckCompleted,
  notifyRankCheckFailed,
  notifyTriggeredAlertDelivered,
} from "@/lib/notifications/events";
import { assertRecoveryFixtureUrl } from "@/lib/provider-evidence/recovery/fixture-url.test-support";
import {
  cleanRecoveryFixtures,
  fixtureNamespace,
} from "@/lib/provider-evidence/recovery/postgres.test-support";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fixtureNow, summaryFixture } from "./postgres.test-support";

vi.mock("@/lib/notifications/realtime", () => ({ publishNotificationCreated: vi.fn() }));
const url = process.env.METERING_TEST_DATABASE_URL;
describe.skipIf(!url)("CN-11 legacy per-keyword delivery PostgreSQL", () => {
  beforeEach(() => {
    assertRecoveryFixtureUrl(url);
    vi.stubEnv("METERING_NAMESPACE", fixtureNamespace);
    vi.stubEnv("BISIBILITY_SECRETS_KEY", Buffer.alloc(32, 7).toString("base64"));
  });
  afterEach(async () => {
    await cleanRecoveryFixtures();
    vi.unstubAllEnvs();
  });
  afterAll(() => prisma.$disconnect());
  it("suppresses the legacy bell path without configuration and preserves alert delivery", async () => {
    const f = await summaryFixture();
    await prisma.notificationPreference.update({
      where: { userId_projectId: { userId: f.user.id, projectId: f.project.id } },
      data: { checkInApp: true },
    });
    // These shared producers have no run/source exception, including api/sdk/cli/mcp.
    await notifyRankCheckCompleted({
      checkedAt: fixtureNow,
      keywordId: f.keyword.id,
      position: 20,
      previousPosition: 10,
      projectId: f.project.id,
      rankCheckId: f.check.id,
    });
    await notifyRankCheckFailed({
      code: "provider_transient",
      failedAt: fixtureNow,
      keywordId: f.keyword.id,
      keywordPublicId: f.keyword.publicId,
      keywordText: f.keyword.text,
      message: "Fixture failure",
      projectDomain: "example.test",
      projectId: f.project.id,
      rankCheckId: f.check.publicId,
    });
    await notifyTriggeredAlertDelivered({
      projectInternalId: f.project.id,
      triggeredAlertId: "fixture-alert",
      payload: {
        action: "Review it.",
        alertId: "al_a00000000000000000000000",
        afterPosition: 20,
        beforePosition: 10,
        conditionType: "position_drop",
        firedAt: fixtureNow.toISOString(),
        headline: "Ranking dropped",
        keyword: f.keyword.text,
        keywordId: f.keyword.publicId,
        projectDomain: "example.test",
        projectId: f.project.publicId,
        ruleId: "alr_a00000000000000000000000",
        ruleName: "Drop",
      },
    });
    const rows = await prisma.notification.findMany({ where: { projectId: f.project.id } });
    expect(
      rows.filter((n) => n.type === "check_complete" || n.type === "check_failed"),
    ).toHaveLength(0);
    expect(rows.filter((n) => n.type === "alert_fired")).toHaveLength(1);
  });
});
