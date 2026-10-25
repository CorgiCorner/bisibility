import { prisma } from "@/lib/db/prisma";
import { envelope } from "@/lib/provider-evidence/dataforseo/fixtures.test-support";
import { parseRecoveryGet } from "@/lib/provider-evidence/dataforseo/parser";
import { applyRecoveryLookup } from "@/lib/provider-evidence/recovery/apply";
import { assertRecoveryFixtureUrl } from "@/lib/provider-evidence/recovery/fixture-url.test-support";
import { claimRecoveryIntent } from "@/lib/provider-evidence/recovery/lease";
import {
  cleanRecoveryFixtures,
  fixtureNamespace,
} from "@/lib/provider-evidence/recovery/postgres.test-support";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  changeDimensions,
  enqueueIncident,
  incidentFixture,
  incidentRows,
  resolvedDimensions,
} from "./postgres.test-support";

vi.mock("@/lib/notifications/realtime", () => ({
  publishNotificationCreated: vi.fn(async () => ({ mode: "polling", ok: true })),
  publishOperationChanged: vi.fn(async () => ({ mode: "polling", ok: true })),
}));

const url = process.env.METERING_TEST_DATABASE_URL;
describe.skipIf(!url)("late fallback incident isolation PostgreSQL", () => {
  beforeEach(() => {
    assertRecoveryFixtureUrl(url);
    vi.stubEnv("METERING_NAMESPACE", fixtureNamespace);
    vi.stubEnv("PROVIDER_RECOVERY", "on");
    vi.stubEnv("BISIBILITY_SECRETS_KEY", Buffer.alloc(32, 7).toString("base64"));
  });
  afterEach(async () => {
    await cleanRecoveryFixtures();
    vi.unstubAllEnvs();
  });
  afterAll(() => prisma.$disconnect());
  it("IN-2 original-provider completion still resolves its incident", async () => {
    const f = await incidentFixture(),
      incident = await enqueueIncident(f);
    await prisma.rankCheck.update({
      where: { id: f.check.id },
      data: { status: "completed", provider: f.identity.provider },
    });
    await changeDimensions(f.operationPk, resolvedDimensions);
    expect(await prisma.providerIncident.findUnique({ where: { id: incident.id } })).toMatchObject({
      state: "resolved",
      resultRecoveredCount: 1,
      costMeasuredCount: 1,
    });
  });
  it.each(["lookup", "exhaustion"])(
    "IN-1 late fallback before %s cannot change the incident before accounting-only promotion",
    async (path) => {
      const f = await incidentFixture();
      await enqueueIncident(f);
      const intent = await prisma.providerRecoveryIntent.findFirstOrThrow({
        where: { operationPk: f.operationPk },
      });
      const lease = path === "lookup" ? await claimRecoveryIntent(intent.id) : null;
      await prisma.rankCheck.update({
        where: { id: f.check.id },
        data: { status: "completed", provider: "fallback" },
      });
      const notification = await prisma.notification.findFirstOrThrow({
        where: { userId: f.user.id },
      });
      await prisma.notification.update({
        where: { id: notification.id },
        data: { readAt: new Date() },
      });
      expect(
        await prisma.providerRecoveryIntent.findUnique({ where: { id: intent.id } }),
      ).toMatchObject({ accountingOnly: false });
      const before = await incidentRows();
      if (path === "lookup") {
        if (!lease) throw new Error("Missing recovery lease");
        expect(
          await applyRecoveryLookup(lease, {
            kind: "evidence",
            ...parseRecoveryGet(envelope()),
            proofSource: {
              accountId: f.identity.payerAccountRef,
              credentialVersion: f.identity.providerCredentialVersion,
              knownId: true,
              listedCostCents: null,
            },
          }),
        ).toMatchObject({ accountingOnly: true });
      } else {
        await prisma.providerRecoveryIntent.update({
          where: { id: intent.id },
          data: { attempts: 5 },
        });
        expect(await claimRecoveryIntent(intent.id)).toBeNull();
        expect(
          await prisma.providerOperationEvidence.findUnique({
            where: { operationPk: f.operationPk },
          }),
        ).toMatchObject({ exhaustionStatus: "exhausted" });
      }
      expect(await incidentRows()).toEqual(before);
    },
  );
});
