import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import { makePublicId } from "@/lib/db/public-id";
import { deliverIncident } from "@/lib/provider-evidence/incidents/delivery";
import {
  changeDimensions,
  enqueueIncident,
  incidentFixture,
  resolvedDimensions,
} from "@/lib/provider-evidence/incidents/postgres.test-support";
import { markRecoveryAttemptStopped } from "@/lib/provider-evidence/recovery/capture";
import { assertRecoveryFixtureUrl } from "@/lib/provider-evidence/recovery/fixture-url.test-support";
import {
  cleanRecoveryFixtures,
  fixtureNamespace,
} from "@/lib/provider-evidence/recovery/postgres.test-support";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createNotification } from "./create";
import { upsertNotification, type VersionedNotification } from "./upsert";

const publish = vi.hoisted(() => vi.fn(async (_event: { kind: string }) => {}));
vi.mock("./realtime", () => ({ publishNotificationCreated: publish }));
const url = process.env.METERING_TEST_DATABASE_URL;
const extraUsers: string[] = [];
async function member(projectId: string) {
  const user = await prisma.user.create({
    data: { email: `${randomUUID()}@example.test`, publicId: makePublicId("usr"), name: "Member" },
  });
  extraUsers.push(user.id);
  await prisma.membership.create({
    data: { projectId, userId: user.id, publicId: makePublicId("mbr") },
  });
  return user;
}
function input(userId: string, projectId: string, version = 1): VersionedNotification {
  return {
    userId,
    projectId,
    version,
    type: "provider_incident",
    title: "Provider evidence incident",
    payload: { version },
    idempotencyKey: "provider-incident:fixture",
  };
}
describe.skipIf(!url)("versioned notification PostgreSQL", () => {
  beforeEach(() => {
    assertRecoveryFixtureUrl(url);
    vi.stubEnv("METERING_NAMESPACE", fixtureNamespace);
    vi.stubEnv("PROVIDER_RECOVERY", "on");
    vi.stubEnv("BISIBILITY_SECRETS_KEY", Buffer.alloc(32, 7).toString("base64"));
    publish.mockClear();
  });
  afterEach(async () => {
    await cleanRecoveryFixtures();
    await prisma.user.deleteMany({ where: { id: { in: extraUsers.splice(0) } } });
    vi.unstubAllEnvs();
  });
  afterAll(() => prisma.$disconnect());
  it("IN-5 real concurrent out-of-order transactions keep the highest version and one row", async () => {
    const f = await incidentFixture();
    const results = await Promise.all(
      [4, 1, 9, 2, 8, 3, 9, 5].map((version) =>
        upsertNotification(input(f.user.id, f.project.id, version)),
      ),
    );
    expect(results.filter((r) => r.status === "inserted")).toHaveLength(1);
    const rows = await prisma.notification.findMany({ where: { userId: f.user.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      version: 9,
      payload: { version: 9 },
      title: "provider_incident",
      body: null,
    });
    const before = rows[0];
    if (!before) throw new Error("Missing notification");
    expect(
      await upsertNotification({
        ...input(f.user.id, f.project.id, 1),
        addedUnresolvedOperation: true,
      }),
    ).toMatchObject({ status: "stale" });
    expect(await prisma.notification.findUnique({ where: { id: before.id } })).toEqual(before);
    expect(publish).toHaveBeenCalledTimes(results.filter((result) => result.notification).length);
    expect(publish.mock.calls.filter(([event]) => event.kind === "created")).toHaveLength(1);
  });
  it("IN-4 both entry points persist structured incident copy only", async () => {
    const f = await incidentFixture();
    const inserted = await createNotification(
      f.user.id,
      f.project.id,
      "provider_incident",
      "Rendered title",
      "Rendered body",
      { resultRecoveredCount: 1 },
    );
    expect(inserted).toMatchObject({ title: "provider_incident", body: null });
    const updated = await upsertNotification({
      ...input(f.user.id, f.project.id),
      title: "Rendered title",
      body: "Rendered body",
    });
    expect(updated.notification).toMatchObject({ title: "provider_incident", body: null });
  });

  it.each(["manual_run_summary", "scheduled_window_summary"] as const)(
    "CN-4 %s stores only structured evidence through both entry points",
    async (type) => {
      const f = await incidentFixture();
      const payload = {
        kind: type === "manual_run_summary" ? "manual" : "scheduled",
        counts: { up: 2 },
        windowStart: "2026-10-25T00:00:00Z",
        windowEnd: "2026-10-25T01:00:00Z",
      };
      const inserted = await createNotification(
        f.user.id,
        f.project.id,
        type,
        "Rendered localized title",
        "Rendered localized body",
        payload,
      );
      expect(inserted).toMatchObject({ title: type, body: null, payload });
      const updated = await upsertNotification({
        ...input(f.user.id, f.project.id),
        type,
        title: "Rendered localized title",
        body: "Rendered localized body",
        payload,
      });
      expect(updated.notification).toMatchObject({ title: type, body: null, payload });
    },
  );

  it("IN-7 resolved/count/cost/equal-version updates preserve readAt; new unresolved link resets it", async () => {
    const f = await incidentFixture(),
      incident = await enqueueIncident(f);
    const notification = await prisma.notification.findFirstOrThrow({
      where: { userId: f.user.id },
    });
    const readAt = new Date("2026-10-01T00:00:00Z");
    await prisma.notification.update({ where: { id: notification.id }, data: { readAt } });
    await changeDimensions(f.operationPk, resolvedDimensions);
    expect(await prisma.notification.findUnique({ where: { id: notification.id } })).toMatchObject({
      version: 2,
      readAt,
    });
    await changeDimensions(f.operationPk, { fulfillment: "partial" });
    expect(await prisma.notification.findUnique({ where: { id: notification.id } })).toMatchObject({
      version: 3,
      readAt,
    });
    await changeDimensions(f.operationPk, {
      accounting: "unknown",
      exhaustionStatus: "exhausted",
      exhaustionReason: "expired",
    });
    const current = await prisma.providerIncident.findUniqueOrThrow({ where: { id: incident.id } });
    await prisma.$transaction((tx) => deliverIncident(tx, current, true));
    expect(await prisma.notification.findUnique({ where: { id: notification.id } })).toMatchObject({
      version: 4,
      readAt,
    });
    const second = await incidentFixture(f.project.id);
    await enqueueIncident(second);
    expect(await prisma.notification.findUnique({ where: { id: notification.id } })).toMatchObject({
      version: 5,
      readAt: null,
    });
    expect(await prisma.notification.count({ where: { userId: f.user.id } })).toBe(1);
  });
  it("IN-7 out-of-order delivery remembers an unresolved addition skipped by that recipient", async () => {
    const f = await incidentFixture();
    const inserted = await upsertNotification(input(f.user.id, f.project.id));
    const id = inserted.notification?.id;
    if (!id) throw new Error("Missing notification");
    const readAt = new Date("2026-10-01T00:00:00Z");
    await prisma.notification.update({ where: { id }, data: { readAt } });
    await upsertNotification({ ...input(f.user.id, f.project.id, 4), unresolvedAddedVersion: 3 });
    expect(await prisma.notification.findUnique({ where: { id } })).toMatchObject({
      readAt: null,
      version: 4,
    });
    await prisma.notification.update({ where: { id }, data: { readAt } });
    await upsertNotification({ ...input(f.user.id, f.project.id, 5), unresolvedAddedVersion: 3 });
    expect(await prisma.notification.findUnique({ where: { id } })).toMatchObject({
      readAt,
      version: 5,
    });
    expect(
      await upsertNotification({
        ...input(f.user.id, f.project.id, 3),
        addedUnresolvedOperation: true,
      }),
    ).toMatchObject({ status: "stale" });
    expect(await prisma.notification.findUnique({ where: { id } })).toMatchObject({
      readAt,
      version: 5,
    });
  });
  it.each(["app", "worker", "api", "sdk", "cli", "mcp"])(
    "IN-10 source %s delivers to owner and current member with missing preferences",
    async (source) => {
      const f = await incidentFixture();
      const recipient = await member(f.project.id);
      await prisma.providerDispatchIdentity.update({
        where: { operationPk: f.operationPk },
        data: {
          requestSource: source,
          requestSurface: ["app", "worker"].includes(source) ? "app" : "programmatic",
        },
      });
      await prisma.meteringOperation.update({
        where: { operation_pk: f.operationPk },
        data: {
          input: {
            provider: "dataforseo",
            operation: "rank_check",
            source,
            surface: ["app", "worker"].includes(source) ? "app" : "programmatic",
            scope: { group: f.project.id, connection: f.connection.id },
          },
        },
      });
      await enqueueIncident(f);
      expect(
        (await prisma.notification.findMany({ where: { projectId: f.project.id } }))
          .map((n) => n.userId)
          .sort(),
      ).toEqual([f.user.id, recipient.id].sort());
    },
  );
  it("IN-10 incident opt-out excludes the user but leaves the independent check setting unchanged", async () => {
    const f = await incidentFixture();
    await prisma.notificationPreference.create({
      data: {
        userId: f.user.id,
        projectId: f.project.id,
        providerIncidentInApp: false,
        checkNotificationSetting: "all",
      },
    });
    await enqueueIncident(f);
    expect(await prisma.notification.count({ where: { projectId: f.project.id } })).toBe(0);
    expect(
      await createNotification(f.user.id, f.project.id, "manual_run_summary", "Manual checks"),
    ).not.toBeNull();
  });
  it.each(["provider_incident", "manual_run_summary", "scheduled_window_summary"] as const)(
    "IN-11 removed member gets no %s through either entry point",
    async (type) => {
      const f = await incidentFixture(),
        recipient = await member(f.project.id);
      await prisma.notificationPreference.create({
        data: { userId: recipient.id, projectId: f.project.id },
      });
      await prisma.membership.deleteMany({
        where: { userId: recipient.id, projectId: f.project.id },
      });
      expect(
        await createNotification(recipient.id, f.project.id, type, "Guarded notification"),
      ).toBeNull();
      expect(
        await upsertNotification({ ...input(recipient.id, f.project.id), type }),
      ).toMatchObject({ status: "blocked" });
      expect(await createNotification(f.user.id, null, type, "Missing project")).toBeNull();
      expect(await prisma.notification.count({ where: { userId: recipient.id } })).toBe(0);
      expect(publish).not.toHaveBeenCalled();
    },
  );
  it.each(["manual_run_summary", "scheduled_window_summary"] as const)(
    "IN-11 None blocks %s through both entry points",
    async (type) => {
      const f = await incidentFixture();
      await prisma.notificationPreference.create({
        data: { userId: f.user.id, projectId: f.project.id, checkNotificationSetting: "none" },
      });
      expect(await createNotification(f.user.id, f.project.id, type, "Summary")).toBeNull();
      expect(await upsertNotification({ ...input(f.user.id, f.project.id), type })).toMatchObject({
        status: "blocked",
      });
    },
  );
  it.each(["default", "legacy-read-only", "editable"])(
    "INV-7 bell %s creates no incident notifications and publishes nothing",
    async (mode) => {
      const f = await incidentFixture();
      if (mode === "default") vi.stubEnv("PROVIDER_RECOVERY", undefined);
      else {
        vi.stubEnv("READ_ONLY_DEMO", mode === "legacy-read-only" ? "1" : "0");
        vi.stubEnv("DEMO_MODE", mode === "editable" ? "editable" : "");
        vi.stubEnv("DEMO_USER_ID", makePublicId("usr"));
        vi.stubEnv("DEMO_OWNER_ID", makePublicId("usr"));
        vi.stubEnv("DEMO_PROJECT_ID", makePublicId("prj"));
      }
      // Simulates delivery of an already enqueued incident after entering demo; capture itself is off in demo.
      const incident = await prisma.providerIncident.create({
        data: { projectId: f.project.id, cause: "dataforseo:rank_check" },
      });
      await markRecoveryAttemptStopped(f.check.id, "workflow_failed");
      await prisma.$transaction((tx) => deliverIncident(tx, incident, true));
      expect(
        await createNotification(f.user.id, f.project.id, "provider_incident", "Incident"),
      ).toBeNull();
      expect(await upsertNotification(input(f.user.id, f.project.id))).toMatchObject({
        status: "blocked",
      });
      expect(await prisma.notification.count({ where: { type: "provider_incident" } })).toBe(0);
      expect(publish).not.toHaveBeenCalled();
      if (mode === "default") {
        expect(
          await createNotification(f.user.id, f.project.id, "alert_fired", "Existing alert"),
        ).not.toBeNull();
        expect(publish).toHaveBeenCalledOnce();
      }
    },
  );
});
