import { randomUUID } from "node:crypto";
import { createBusinessLocationFor } from "@/lib/business-location-store/location-write";
import {
  identityCommand,
  seedBusinessProject,
} from "@/lib/business-location-store/postgres.test-fixture";
import { describe, expect, it } from "vitest";
import { monitorDatabase } from "./postgres.test-fixture";
import { readLocalMonitor, readLocalMonitorHistory } from "./read";
import { setLocalMonitorScheduleIntent } from "./schedule";
import { archiveLocalMonitor, createLocalMonitor, reviseLocalMonitor } from "./write";

const suite = describe.skipIf(!process.env.PROVIDER_UI_TEST_DATABASE_URL);

suite("persisted monitor authority using the complete migrated schema", () => {
  it("creates ordered geometry without provider work, replays once, and retains A -> B -> A revisions", async () => {
    const f = await monitorDatabase();
    try {
      const first = await createLocalMonitor(f.command, f.writerContext, { db: f.db });
      expect((await createLocalMonitor(f.command, f.writerContext, { db: f.db })).replayed).toBe(
        true,
      );
      expect(await f.db.localMonitor.count()).toBe(1);
      const ref = { projectId: f.project.publicId, monitorId: first.receipt.monitorId };
      const second = await reviseLocalMonitor(
        {
          ...f.command,
          ...ref,
          idempotencyKey: randomUUID(),
          expectedVersion: 1,
          definition: {
            ...f.command.definition,
            grid: { ...f.command.definition.grid, latitude: "53" },
          },
        },
        f.writerContext,
        { db: f.db },
      );
      const third = await reviseLocalMonitor(
        { ...f.command, ...ref, idempotencyKey: randomUUID(), expectedVersion: 2 },
        f.writerContext,
        { db: f.db },
      );
      expect(new Set([first, second, third].map((r) => r.receipt.revisionId)).size).toBe(3);
      expect(
        (await readLocalMonitorHistory(ref, f.writerContext, { db: f.db, kind: "definition" }))
          .items,
      ).toHaveLength(3);
      const detail = await readLocalMonitor(ref, f.writerContext, f.db);
      expect(detail.grid.points.map((point) => point.ordinal)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
      expect(await f.db.localMeasurementRun.count()).toBe(0);
      expect(await f.db.localMeasurementTarget.count()).toBe(0);
      expect(await f.db.rankCheck.count()).toBe(0);
      expect(f.consents()).toBe(0);
    } finally {
      await f.close();
    }
  }, 120_000);
  it("renews actual membership before replay or read and never trusts claimed owner roles", async () => {
    const f = await monitorDatabase();
    try {
      await expect(createLocalMonitor(f.command, f.ownerContext, { db: f.db })).rejects.toThrow();
      const created = await createLocalMonitor(f.command, f.writerContext, { db: f.db });
      const ref = { projectId: f.project.publicId, monitorId: created.receipt.monitorId };
      expect((await readLocalMonitor(ref, f.ownerContext, f.db)).id).toBe(ref.monitorId);
      await f.db.membership.deleteMany({ where: { projectId: f.project.id, userId: f.writer.id } });
      await expect(createLocalMonitor(f.command, f.writerContext, { db: f.db })).rejects.toThrow();
      await expect(readLocalMonitor(ref, f.writerContext, f.db)).rejects.toThrow();
    } finally {
      await f.close();
    }
  }, 120_000);
  it("rejects stale CAS and cross-project subject selection without appending anything", async () => {
    const f = await monitorDatabase();
    try {
      const created = await createLocalMonitor(f.command, f.writerContext, { db: f.db });
      await expect(
        reviseLocalMonitor(
          {
            ...f.command,
            monitorId: created.receipt.monitorId,
            expectedVersion: 0,
            idempotencyKey: randomUUID(),
          },
          f.writerContext,
          { db: f.db },
        ),
      ).rejects.toMatchObject({ status: 409 });
      const foreign = await seedBusinessProject(f);
      const identity = await createBusinessLocationFor(
        identityCommand(foreign.project.publicId),
        foreign.writerContext,
        f.db,
      );
      if (identity.receipt.kind !== "identity") throw new Error("Missing foreign fixture identity");
      await expect(
        createLocalMonitor(
          {
            ...f.command,
            idempotencyKey: randomUUID(),
            definition: {
              ...f.command.definition,
              locationId: identity.receipt.publicId,
              identityRevisionId: identity.receipt.revisionId,
            },
          },
          f.writerContext,
          { db: f.db },
        ),
      ).rejects.toThrow();
      expect(await f.db.localMonitorRevision.count()).toBe(1);
    } finally {
      await f.close();
    }
  }, 120_000);
  it("freezes calendar policy; later timezone or keyword epoch edits require new review", async () => {
    const f = await monitorDatabase();
    try {
      const created = await createLocalMonitor(f.command, f.writerContext, { db: f.db });
      const ref = { projectId: f.project.publicId, monitorId: created.receipt.monitorId };
      await setLocalMonitorScheduleIntent(
        {
          ...ref,
          expectedVersion: 1,
          idempotencyKey: randomUUID(),
          mode: "scheduled",
          scheduleId: f.schedule.publicId,
          expectedScheduleEpoch: String(f.schedule.measurementEpoch),
          consentToken: "synthetic-explicit-confirmation",
        },
        f.writerContext,
        f.consent,
        { db: f.db },
      );
      expect(
        (await readLocalMonitor(ref, f.writerContext, f.db)).readiness.scheduledIntentCurrent,
      ).toBe(true);
      await f.db.checkSchedule.update({ where: { id: f.schedule.id }, data: { timezone: "UTC" } });
      const changed = await readLocalMonitor(ref, f.writerContext, f.db);
      expect(changed.readiness.reasons).toContain("calendar_changed");
      expect(changed.schedule.calendar).toMatchObject({ timezone: "Europe/Warsaw" });
      await f.db.keyword.update({ where: { id: f.keyword.id }, data: { text: "Different" } });
      await f.db.keyword.update({ where: { id: f.keyword.id }, data: { text: f.keyword.text } });
      expect((await readLocalMonitor(ref, f.writerContext, f.db)).readiness.reasons).toContain(
        "keyword_changed",
      );
      expect(await f.db.localMeasurementRun.count()).toBe(0);
    } finally {
      await f.close();
    }
  }, 120_000);
  it("enforces immutable history and archives without deleting retained points or revisions", async () => {
    const f = await monitorDatabase();
    try {
      const created = await createLocalMonitor(f.command, f.writerContext, { db: f.db });
      const ref = { projectId: f.project.publicId, monitorId: created.receipt.monitorId };
      await expect(
        f.client.query(
          'UPDATE local_monitor_grid_points SET ordinal=10 WHERE "revisionId"=$1 AND ordinal=0',
          [created.receipt.revisionId],
        ),
      ).rejects.toThrow();
      await expect(
        f.client.query("DELETE FROM local_monitor_revisions WHERE id=$1", [
          created.receipt.revisionId,
        ]),
      ).rejects.toThrow();
      await archiveLocalMonitor(
        { ...ref, expectedVersion: 1, idempotencyKey: randomUUID() },
        f.writerContext,
        { db: f.db },
      );
      expect((await readLocalMonitor(ref, f.writerContext, f.db)).readiness.reasons).toContain(
        "archived",
      );
      expect(await f.db.localMonitorGridPoint.count()).toBe(9);
      await expect(
        reviseLocalMonitor(
          { ...f.command, ...ref, expectedVersion: 2, idempotencyKey: randomUUID() },
          f.writerContext,
          { db: f.db },
        ),
      ).rejects.toThrow();
    } finally {
      await f.close();
    }
  }, 120_000);
});
