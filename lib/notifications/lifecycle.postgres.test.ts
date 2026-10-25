import { prisma } from "@/lib/db/prisma";
import { makePublicId } from "@/lib/db/public-id";
import { deleteProjectById, readProjectDeleteSnapshot } from "@/lib/projects/settings-store";
import {
  enqueueIncident,
  incidentFixture,
} from "@/lib/provider-evidence/incidents/postgres.test-support";
import { assertRecoveryFixtureUrl } from "@/lib/provider-evidence/recovery/fixture-url.test-support";
import {
  cleanRecoveryFixtures,
  fixtureNamespace,
} from "@/lib/provider-evidence/recovery/postgres.test-support";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { closeProjectIncidentsSilently } from "./close-project-incidents";
import { getNotificationFeedForScope } from "./feed";
import { notificationTransaction } from "./transaction";
import { upsertNotification } from "./upsert";
import { withdrawNotification } from "./withdraw";

const publish = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("./realtime", () => ({ publishNotificationCreated: publish }));
const url = process.env.METERING_TEST_DATABASE_URL;
describe.skipIf(!url)("incident delivery lifecycle PostgreSQL", () => {
  beforeEach(() => {
    assertRecoveryFixtureUrl(url);
    vi.stubEnv("METERING_NAMESPACE", fixtureNamespace);
    vi.stubEnv("PROVIDER_RECOVERY", "on");
    vi.stubEnv("BISIBILITY_SECRETS_KEY", Buffer.alloc(32, 7).toString("base64"));
    publish.mockClear();
  });
  afterEach(async () => {
    await cleanRecoveryFixtures();
    vi.unstubAllEnvs();
  });
  afterAll(() => prisma.$disconnect());
  it("IN-6 external incident transaction publishes created/updated only after commit; rollback publishes nothing", async () => {
    const f = await incidentFixture();
    const incident = await enqueueIncident(f);
    expect(publish).toHaveBeenCalledOnce();
    expect(publish).toHaveBeenLastCalledWith(expect.objectContaining({ kind: "created" }));
    publish.mockClear();
    const before = await prisma.notification.findFirstOrThrow({ where: { userId: f.user.id } });
    const input = {
      userId: f.user.id,
      projectId: f.project.id,
      type: "provider_incident" as const,
      title: "provider_incident",
      payload: { version: 2 },
      version: 2,
      idempotencyKey: `provider-incident:${incident.id}`,
    };
    await expect(
      notificationTransaction(async (tx) => {
        await upsertNotification(input, tx);
        expect(publish).not.toHaveBeenCalled();
        throw new Error("rollback fixture");
      }),
    ).rejects.toThrow("rollback fixture");
    expect(publish).not.toHaveBeenCalled();
    expect(await prisma.notification.findUnique({ where: { id: before.id } })).toEqual(before);
    await notificationTransaction(async (tx) => {
      await upsertNotification(input, tx);
      expect(publish).not.toHaveBeenCalled();
    });
    expect(publish).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ kind: "updated" }));
  });
  it("IN-6 withdrawal bumps version once, removes feed and unread count, and publishes withdrawn", async () => {
    const f = await incidentFixture();
    const incident = await enqueueIncident(f);
    const scope = { userId: f.user.id, activeProjectId: f.project.id };
    expect((await getNotificationFeedForScope(scope, { locale: "en" })).unreadCount).toBe(1);
    publish.mockClear();
    await expect(
      notificationTransaction(async (tx) => {
        await withdrawNotification(
          { userId: f.user.id, idempotencyKey: `provider-incident:${incident.id}` },
          tx,
        );
        expect(publish).not.toHaveBeenCalled();
        throw new Error("withdrawal rollback");
      }),
    ).rejects.toThrow("withdrawal rollback");
    expect(publish).not.toHaveBeenCalled();
    expect((await getNotificationFeedForScope(scope, { locale: "en" })).unreadCount).toBe(1);
    expect(
      await withdrawNotification({
        userId: f.user.id,
        idempotencyKey: `provider-incident:${incident.id}`,
      }),
    ).toBe(1);
    const row = await prisma.notification.findFirstOrThrow({ where: { userId: f.user.id } });
    expect(row.version).toBe(2);
    expect(row.withdrawnAt).not.toBeNull();
    expect(await getNotificationFeedForScope(scope, { locale: "en" })).toEqual({
      items: [],
      unreadCount: 0,
    });
    expect(
      (await getNotificationFeedForScope(scope, { locale: "en", openIncidents: true })).items,
    ).toEqual([]);
    expect(publish).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ kind: "withdrawn" }));
    expect(
      await withdrawNotification({
        userId: f.user.id,
        idempotencyKey: `provider-incident:${incident.id}`,
      }),
    ).toBe(0);
    expect(publish).toHaveBeenCalledOnce();
    await upsertNotification({
      userId: f.user.id,
      projectId: f.project.id,
      type: "provider_incident",
      title: "provider_incident",
      payload: {},
      idempotencyKey: `provider-incident:${incident.id}`,
      version: 1,
    });
    expect((await getNotificationFeedForScope(scope, { locale: "en" })).items).lengthOf(0);
  });
  it("IN-8 older open incidents remain reachable beyond eleven newer ordinary rows with recipient/project/state scope", async () => {
    const f = await incidentFixture(),
      other = await incidentFixture();
    const incident = await enqueueIncident(f);
    const otherIncident = await enqueueIncident(other);
    await prisma.notification.updateMany({
      where: { userId: f.user.id },
      data: { createdAt: new Date("2020-01-01Z") },
    });
    await prisma.notification.createMany({
      data: Array.from({ length: 11 }, (_, i) => ({
        userId: f.user.id,
        projectId: f.project.id,
        publicId: makePublicId("ntf"),
        type: "system" as const,
        title: `Newer ${i}`,
      })),
    });
    const resolved = await prisma.providerIncident.create({
      data: {
        projectId: f.project.id,
        cause: "fixture:resolved",
        state: "resolved",
        resolvedAt: new Date(),
        openSlot: null,
      },
    });
    for (const [userId, projectId, id] of [
      [f.user.id, f.project.id, resolved.id],
      [f.user.id, other.project.id, otherIncident.id],
      [other.user.id, f.project.id, incident.id],
    ]) {
      await prisma.notification.create({
        data: {
          userId,
          projectId,
          type: "provider_incident",
          title: "provider_incident",
          publicId: makePublicId("ntf"),
          idempotencyKey: `provider-incident:${id}`,
          payload: { state: "open", resultUnderReviewCount: 1, costUnderReviewCount: 1 },
        },
      });
    }
    const scope = { userId: f.user.id, activeProjectId: f.project.id };
    const ordinary = await getNotificationFeedForScope(scope, { locale: "en" });
    expect(ordinary.items).toHaveLength(10);
    expect(
      ordinary.items.some(
        (row) =>
          row.payload &&
          typeof row.payload === "object" &&
          !Array.isArray(row.payload) &&
          row.payload.incidentId === "[redacted]",
      ),
    ).toBe(false);
    const open = await getNotificationFeedForScope(scope, {
      openIncidents: true,
      locale: "en",
      limit: 1,
    });
    expect(open.items).toHaveLength(1);
    expect(open.items[0]?.payload).toMatchObject({ incidentId: "[redacted]" });
    // More than ten open incidents must also remain reachable, irrespective of a caller's limit.
    for (let i = 0; i < 11; i++) {
      const extra = await prisma.providerIncident.create({
        data: { projectId: f.project.id, cause: `fixture:extra_${i}` },
      });
      await prisma.notification.create({
        data: {
          userId: f.user.id,
          projectId: f.project.id,
          type: "provider_incident",
          title: "provider_incident",
          publicId: makePublicId("ntf"),
          idempotencyKey: `provider-incident:${extra.id}`,
          payload: { state: "open", resultUnderReviewCount: 1, costUnderReviewCount: 1 },
        },
      });
    }
    expect(
      (await getNotificationFeedForScope(scope, { openIncidents: true, locale: "en", limit: 1 }))
        .items,
    ).toHaveLength(12);
    expect(
      (
        await getNotificationFeedForScope(
          { userId: other.user.id, activeProjectId: f.project.id },
          { openIncidents: true, locale: "en" },
        )
      ).items,
    ).toEqual([]);
  });
  it("IN-9 silent retirement closes open incidents and preserves transitions/digests/watermarks without publishing", async () => {
    const f = await incidentFixture();
    const incident = await enqueueIncident(f);
    await prisma.providerIncidentDeliveryWatermark.create({
      data: { projectId: f.project.id, deliveredThrough: new Date("2026-01-01Z") },
    });
    const transitions = await prisma.providerIncidentTransition.findMany({
      where: { incidentId: incident.id },
    });
    const digests = await prisma.weeklyDigestSend.findMany({ where: { projectId: f.project.id } });
    const watermark = await prisma.providerIncidentDeliveryWatermark.findUnique({
      where: { projectId: f.project.id },
    });
    publish.mockClear();
    await notificationTransaction(async (tx) => {
      await closeProjectIncidentsSilently(tx, f.project.id);
      await tx.project.update({ where: { id: f.project.id }, data: { writeMode: "migrated" } });
    });
    expect(await prisma.providerIncident.findUnique({ where: { id: incident.id } })).toMatchObject({
      state: "resolved",
      openSlot: null,
      version: incident.version,
    });
    expect(
      await prisma.providerIncidentTransition.findMany({ where: { incidentId: incident.id } }),
    ).toEqual(transitions);
    expect(await prisma.weeklyDigestSend.findMany({ where: { projectId: f.project.id } })).toEqual(
      digests,
    );
    expect(
      await prisma.providerIncidentDeliveryWatermark.findUnique({
        where: { projectId: f.project.id },
      }),
    ).toEqual(watermark);
    expect(publish).not.toHaveBeenCalled();
    expect(await prisma.notification.count({ where: { userId: f.user.id } })).toBe(0);
  });
  it("IN-9 project deletion never exposes a project-less incident in the global or other-project feed", async () => {
    const f = await incidentFixture(),
      other = await incidentFixture();
    await enqueueIncident(f);
    const before = await readProjectDeleteSnapshot(f.project.id);
    if (!before) throw new Error("Missing project");
    publish.mockClear();
    const transitionWrite = vi.spyOn(prisma.providerIncidentTransition, "create");
    const digestWrite = vi.spyOn(prisma.weeklyDigestSend, "create");
    await deleteProjectById(f.project.id, {
      actorId: f.user.id,
      targetId: f.project.publicId,
      before,
    });
    expect(
      await getNotificationFeedForScope(
        { userId: f.user.id, activeProjectId: null },
        { locale: "en" },
      ),
    ).toEqual({ items: [], unreadCount: 0 });
    expect(
      await getNotificationFeedForScope(
        { userId: f.user.id, activeProjectId: other.project.id },
        { locale: "en" },
      ),
    ).toEqual({ items: [], unreadCount: 0 });
    expect(await prisma.providerIncident.count({ where: { projectId: f.project.id } })).toBe(0);
    expect(
      await prisma.providerIncidentDeliveryWatermark.count({ where: { projectId: f.project.id } }),
    ).toBe(0);
    expect(publish).not.toHaveBeenCalled();
    expect(transitionWrite).not.toHaveBeenCalled();
    expect(digestWrite).not.toHaveBeenCalled();
    transitionWrite.mockRestore();
    digestWrite.mockRestore();
  });
});
