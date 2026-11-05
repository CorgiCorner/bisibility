import { randomUUID } from "node:crypto";
import { makePublicId } from "@/lib/db/public-id";
import type { PrismaClient } from "@/lib/generated/prisma/client";
import { closeoutPostgresFixture } from "@/lib/metering/history-closeout/postgres.test-fixture";
import { afterAll, beforeAll, expect, it, vi } from "vitest";

const store = vi.hoisted(() => ({ db: undefined as unknown as PrismaClient }));
vi.mock("@/lib/db/prisma", () => ({
  get prisma() {
    return store.db;
  },
}));
vi.mock("@/lib/notifications/events", () => ({ notifyScheduleBlocked: vi.fn() }));
let fixture: Awaited<ReturnType<typeof closeoutPostgresFixture>> | undefined;
const { materializePlannedRun } = await import("./materialize");
beforeAll(async () => {
  fixture = await closeoutPostgresFixture({ schemaOnly: true });
  store.db = fixture.db;
}, 60000);
afterAll(async () => {
  if (fixture) await fixture.close();
});

it.each(["operation_unavailable", "provider_account_blocked"])(
  "persists %s when an occurrence expires",
  async (reason) => {
    const id = randomUUID();
    const user = await store.db.user.create({
      data: { publicId: makePublicId("usr"), email: `${id}@example.com`, name: "Fixture" },
    });
    try {
      const project = await store.db.project.create({
        data: {
          publicId: makePublicId("prj"),
          ownerId: user.id,
          name: "Fixture",
          domain: "example.com",
        },
      });
      const schedule = await store.db.checkSchedule.create({
        data: {
          publicId: makePublicId("sch"),
          projectId: project.id,
          name: "Daily",
          frequency: "daily",
          timezone: "UTC",
          jitterMinutes: 0,
          enabled: true,
        },
      });
      const run = await store.db.rankCheckRun.create({
        data: {
          publicId: makePublicId("rcr"),
          projectId: project.id,
          checkScheduleId: schedule.id,
          trigger: "scheduled",
          selectionKind: "scheduled_due",
          selectionHash: id,
          selectionSpec: { occurrenceKey: "2026-09-02" },
          status: "blocked",
          blockedReason: reason,
        },
      });
      expect(await materializePlannedRun(run.id, new Date("2026-09-04T08:00:00Z"))).toBe("expired");
      expect(
        await store.db.rankCheckRun.findUniqueOrThrow({ where: { id: run.id } }),
      ).toMatchObject({
        status: "completed",
        outcome: "deferred",
        blockedReason: "occurrence_expired",
        expiryBlockedReason: reason,
      });
    } finally {
      await store.db.user.delete({ where: { id: user.id } });
    }
  },
);
