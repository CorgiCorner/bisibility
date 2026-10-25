import { deleteAccountRecords } from "@/lib/account/account-deletion";
import { enableMigrationHold, markProjectMigrated } from "@/lib/actions/project-write-mode";
import { prisma } from "@/lib/db/prisma";
import { makePublicId } from "@/lib/db/public-id";
import {
  enqueueIncident,
  incidentFixture,
} from "@/lib/provider-evidence/incidents/postgres.test-support";
import { refreshOperationIncident } from "@/lib/provider-evidence/incidents/refresh";
import { markRecoveryAttemptStopped } from "@/lib/provider-evidence/recovery/capture";
import { assertRecoveryFixtureUrl } from "@/lib/provider-evidence/recovery/fixture-url.test-support";
import {
  cleanRecoveryFixtures,
  fixtureNamespace,
} from "@/lib/provider-evidence/recovery/postgres.test-support";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getNotificationFeedForScope } from "./feed";
import { notificationTransaction } from "./transaction";
import { upsertNotification } from "./upsert";

const state = vi.hoisted(() => ({ userId: "", publish: vi.fn(async () => {}), snapshot: vi.fn() }));
vi.mock("@/lib/notifications/realtime", () => ({ publishNotificationCreated: state.publish }));
vi.mock("@/lib/account/account-deletion-extension", () => ({ onAccountDeletion: vi.fn() }));
vi.mock("@/lib/analytics/person-deletion", () => ({
  queueAnalyticsPersonDeletion: vi.fn(),
  flushAnalyticsPersonDeletions: vi.fn(),
}));
vi.mock("@/lib/actions/_shared", () => ({
  getActionActor: async () => ({ id: state.userId }),
  parseActionInput: (_schema: unknown, input: unknown) => input,
  requireProjectScope: async () => state.snapshot(),
  revalidateSettingsViews: vi.fn(),
}));
const url = process.env.METERING_TEST_DATABASE_URL;
describe.skipIf(!url)("IN-9 project retirement entry points PostgreSQL", () => {
  beforeEach(() => {
    assertRecoveryFixtureUrl(url);
    vi.stubEnv("METERING_NAMESPACE", fixtureNamespace);
    vi.stubEnv("PROVIDER_RECOVERY", "on");
    vi.stubEnv("BISIBILITY_SECRETS_KEY", Buffer.alloc(32, 7).toString("base64"));
    state.publish.mockClear();
  });
  afterEach(async () => {
    await cleanRecoveryFixtures();
    vi.unstubAllEnvs();
  });
  afterAll(() => prisma.$disconnect());
  it("account deletion cleans surviving member notifications before the owned project cascade", async () => {
    const f = await incidentFixture(),
      member = await incidentFixture();
    await prisma.membership.create({
      data: { projectId: f.project.id, userId: member.user.id, publicId: makePublicId("mbr") },
    });
    await enqueueIncident(f);
    expect(await prisma.notification.count({ where: { userId: member.user.id } })).toBe(1);
    state.publish.mockClear();
    await deleteAccountRecords({ userId: f.user.id, confirmEmail: f.user.email, source: "web" });
    expect(await prisma.project.findUnique({ where: { id: f.project.id } })).toBeNull();
    expect(
      await getNotificationFeedForScope(
        { userId: member.user.id, activeProjectId: null },
        { locale: "en" },
      ),
    ).toEqual({ items: [], unreadCount: 0 });
    expect(
      await prisma.providerIncidentTransition.count({
        where: { incident: { projectId: f.project.id } },
      }),
    ).toBe(0);
    expect(await prisma.weeklyDigestSend.count({ where: { projectId: f.project.id } })).toBe(0);
    expect(state.publish).not.toHaveBeenCalled();
  });
  it("markProjectMigrated closes silently, while a temporary migration hold keeps incidents open", async () => {
    const f = await incidentFixture();
    const incident = await enqueueIncident(f);
    state.userId = f.user.id;
    state.snapshot.mockImplementation(() =>
      prisma.project.findUniqueOrThrow({ where: { id: f.project.id } }),
    );
    state.publish.mockClear();
    const transitions = await prisma.providerIncidentTransition.findMany({
      where: { incidentId: incident.id },
    });
    await enableMigrationHold({ projectId: f.project.publicId });
    expect(await prisma.providerIncident.findUnique({ where: { id: incident.id } })).toMatchObject({
      state: "open",
    });
    expect(await prisma.notification.count({ where: { projectId: f.project.id } })).toBe(1);
    await markProjectMigrated({ projectId: f.project.publicId });
    expect(await prisma.providerIncident.findUnique({ where: { id: incident.id } })).toMatchObject({
      state: "resolved",
      version: incident.version,
    });
    expect(await prisma.notification.count({ where: { projectId: f.project.id } })).toBe(0);
    expect(
      await prisma.providerIncidentTransition.findMany({ where: { incidentId: incident.id } }),
    ).toEqual(transitions);
    expect(await prisma.weeklyDigestSend.count({ where: { projectId: f.project.id } })).toBe(0);
    expect(
      await prisma.providerIncidentDeliveryWatermark.count({ where: { projectId: f.project.id } }),
    ).toBe(0);
    const closed = await prisma.providerIncident.findUniqueOrThrow({ where: { id: incident.id } });
    await notificationTransaction(async (tx) => {
      await tx.providerOperationEvidence.update({
        where: { operationPk: f.operationPk },
        data: { fulfillment: "partial" },
      });
      await refreshOperationIncident(tx, f.operationPk);
    });
    expect(await prisma.providerIncident.findUnique({ where: { id: incident.id } })).toEqual(
      closed,
    );
    const second = await incidentFixture(f.project.id);
    await markRecoveryAttemptStopped(second.check.id, "workflow_failed");
    expect(
      await prisma.providerIncidentOperation.findUnique({
        where: { operationPk: second.operationPk },
      }),
    ).toBeNull();
    expect(
      await upsertNotification({
        userId: f.user.id,
        projectId: f.project.id,
        type: "provider_incident",
        title: "provider_incident",
        payload: {},
        version: incident.version + 10,
        idempotencyKey: `provider-incident:${incident.id}`,
      }),
    ).toMatchObject({ status: "blocked" });
    expect(state.publish).not.toHaveBeenCalled();
  });
});
