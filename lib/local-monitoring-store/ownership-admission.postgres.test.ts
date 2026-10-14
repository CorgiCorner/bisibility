import { Prisma } from "@/lib/generated/prisma/client";
import { createGridRevision } from "@/lib/local-monitoring/geometry";
import { meteringNamespace } from "@/lib/metering/runtime";
import { putSpendingBudget } from "@/lib/metering/spending-limit-store";
import { projectSpendingBudget } from "@/lib/metering/spending-limits";
import { describe, expect, it } from "vitest";
import { createLocalMeasurementTarget } from "./create-target";
import { localMeasurementDatabase } from "./postgres.test-fixture";
import { prepareLocalMeasurementRun } from "./prepare-run";
import { readLocalMeasurementRun } from "./run-read";

const suite = describe.skipIf(!process.env.PROVIDER_UI_TEST_DATABASE_URL);
suite("local monitoring joined ownership and canonical admission (full schema)", () => {
  it("rejects an unconfigured device without creating points or targets", async () => {
    const f = await localMeasurementDatabase();
    try {
      await expect(
        createLocalMeasurementTarget(
          { ...f.targetCommand, device: "mobile" },
          f.writerContext,
          f.ports.policy,
          f.db,
        ),
      ).rejects.toMatchObject({ name: "LocalDeviceNotConfiguredError" });
      expect(await f.db.localMeasurementPoint.count()).toBe(0);
      expect(await f.db.localMeasurementTarget.count()).toBe(0);
    } finally {
      await f.close();
    }
  }, 120_000);
  it("uses current viewer membership despite supplied owner role", async () => {
    const f = await localMeasurementDatabase();
    try {
      const target = await f.target();
      await expect(
        prepareLocalMeasurementRun(f.launch([target]), f.ownerContext, f.ports, f.db),
      ).rejects.toMatchObject({ code: "forbidden" });
      expect(await f.db.meteringUsageEvidence.count()).toBe(0);
    } finally {
      await f.close();
    }
  }, 120_000);
  it("denies deactivated actors and held projects before idempotent replay", async () => {
    const f = await localMeasurementDatabase();
    try {
      const target = await f.target();
      const command = f.launch([target]);
      const admitted = await prepareLocalMeasurementRun(command, f.writerContext, f.ports, f.db);
      await f.db.project.update({
        where: { id: f.project.id },
        data: { writeMode: "migration_hold" },
      });
      await expect(
        prepareLocalMeasurementRun(command, f.writerContext, f.ports, f.db),
      ).rejects.toMatchObject({ name: "ProjectReadOnlyError" });
      await f.db.project.update({ where: { id: f.project.id }, data: { writeMode: "active" } });
      await f.db.user.update({ where: { id: f.writer.id }, data: { deactivatedAt: new Date() } });
      await expect(
        prepareLocalMeasurementRun(command, f.writerContext, f.ports, f.db),
      ).rejects.toMatchObject({ code: "forbidden" });
      expect(admitted.fresh).toBe(true);
      expect(await f.db.meteringUsageEvidence.count()).toBe(1);
    } finally {
      await f.close();
    }
  }, 120_000);
  it("refuses a changed current keyword device before admission", async () => {
    const f = await localMeasurementDatabase();
    try {
      const target = await f.target();
      await f.db.keyword.update({ where: { id: f.keyword.id }, data: { device: "mobile" } });
      await expect(
        prepareLocalMeasurementRun(f.launch([target]), f.writerContext, f.ports, f.db),
      ).rejects.toMatchObject({ name: "LocalDeviceNotConfiguredError" });
      expect(await f.db.localMeasurementRun.count()).toBe(0);
    } finally {
      await f.close();
    }
  }, 120_000);
  it("refuses a capability without product activation and rejects unknown quote amounts", async () => {
    const f = await localMeasurementDatabase();
    try {
      const target = await f.target();
      const data = f.launch([target]);
      f.ports.activation.assertRegistered = async () => {
        throw new Error("No real point capability registered.");
      };
      await expect(
        prepareLocalMeasurementRun(data, f.writerContext, f.ports, f.db),
      ).rejects.toThrow("No real point");
      data.quote = { ...data.quote, nativeEstimates: [{ unit: "cents", amount: null }] };
      await expect(
        prepareLocalMeasurementRun(data, f.writerContext, f.ports, f.db),
      ).rejects.toThrow("Unknown native estimate");
      expect(await f.db.localMeasurementTargetOwner.count()).toBe(0);
      expect(f.counters.submissions).toBe(0);
    } finally {
      await f.close();
    }
  }, 120_000);
  it("rolls back full run, target owners and canonical evidence when the real budget denies", async () => {
    const f = await localMeasurementDatabase();
    try {
      const targets = [await f.target(), await f.target("22")];
      const command = f.launch(targets);
      const estimate = command.quote.nativeEstimates[0];
      if (estimate?.unit !== "cents" || estimate.amount === null)
        throw new Error("Fixture requires a known native cents estimate.");
      const total = new Prisma.Decimal(estimate.amount);
      const cap = total.dividedBy(2).toDecimalPlaces(4, Prisma.Decimal.ROUND_DOWN);
      expect(cap.greaterThan(0)).toBe(true);
      expect(cap.lessThan(total)).toBe(true);
      await f.db.$transaction((tx) =>
        putSpendingBudget(
          tx,
          projectSpendingBudget(meteringNamespace(), f.project.id, cap.toFixed(4), 2),
        ),
      );
      await expect(
        prepareLocalMeasurementRun(command, f.writerContext, f.ports, f.db),
      ).rejects.toMatchObject({ name: "BudgetExhaustedError" });
      expect(await f.db.localMeasurementRun.count()).toBe(0);
      expect(await f.db.localMeasurementRunItem.count()).toBe(0);
      expect(await f.db.localMeasurementTargetOwner.count()).toBe(0);
      expect(await f.db.meteringUsageEvidence.count()).toBe(0);
    } finally {
      await f.close();
    }
  }, 120_000);
  it("serializes different caller keys into one target owner and one canonical admission", async () => {
    const f = await localMeasurementDatabase();
    try {
      const target = await f.target();
      const outcomes = await Promise.allSettled([
        prepareLocalMeasurementRun(f.launch([target]), f.writerContext, f.ports, f.db),
        prepareLocalMeasurementRun(f.launch([target]), f.writerContext, f.ports, f.db),
      ]);
      expect(outcomes.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
      expect(outcomes.filter(({ status }) => status === "rejected")).toHaveLength(1);
      expect(await f.db.localMeasurementTargetOwner.count()).toBe(1);
      expect(await f.db.meteringUsageEvidence.count()).toBe(1);
      expect(f.counters.submissions).toBe(0);
    } finally {
      await f.close();
    }
  }, 120_000);
  it("does not crop frozen scope or admit the free part of a blocked full selection", async () => {
    const f = await localMeasurementDatabase();
    try {
      const first = await f.target();
      const second = await f.target("22");
      const full = f.launch([first, second]);
      await expect(
        prepareLocalMeasurementRun(
          { ...full, targetIds: [first.id] },
          f.writerContext,
          f.ports,
          f.db,
        ),
      ).rejects.toThrow("full frozen selection");
      await prepareLocalMeasurementRun(f.launch([first]), f.writerContext, f.ports, f.db);
      await expect(
        prepareLocalMeasurementRun(full, f.writerContext, f.ports, f.db),
      ).rejects.toMatchObject({ name: "LocalTargetBlocked" });
      expect(await f.db.localMeasurementRun.count()).toBe(1);
      expect(await f.db.localMeasurementRunItem.count()).toBe(1);
      expect(await f.db.meteringUsageEvidence.count()).toBe(1);
    } finally {
      await f.close();
    }
  }, 120_000);
  it("replays a durable run without another first-send permit and exposes a viewer-safe projection", async () => {
    const f = await localMeasurementDatabase();
    try {
      const target = await f.target();
      const data = f.launch([target]);
      const first = await prepareLocalMeasurementRun(data, f.writerContext, f.ports, f.db);
      const replay = await prepareLocalMeasurementRun(data, f.writerContext, f.ports, f.db);
      expect(first.submitters).toHaveLength(1);
      expect(replay.fresh).toBe(false);
      expect(replay.submitters).toHaveLength(0);
      const view = await readLocalMeasurementRun(
        { projectId: f.project.publicId, runId: first.id },
        f.ownerContext,
        f.db,
      );
      expect(view.expectedCount).toBe(1);
      expect(JSON.stringify(view)).not.toMatch(
        /credentialVersion|providerRequestId|costCents|synthetic-task/,
      );
      expect(await f.db.meteringUsageEvidence.count()).toBe(1);
    } finally {
      await f.close();
    }
  }, 120_000);
  it("retains server frozen grid point IDs without cloning Keywords", async () => {
    const f = await localMeasurementDatabase();
    try {
      const grid = createGridRevision({
        revisionId: "synthetic-grid-revision-1",
        center: { latitude: "52", longitude: "21" },
        size: 1,
        spacingMetres: 100,
      });
      const point = grid.points[0].point;
      const target = await createLocalMeasurementTarget(
        { ...f.targetCommand, ...point.coordinate },
        f.writerContext,
        f.ports.policy,
        f.db,
        point,
      );
      const stored = await f.db.localMeasurementPoint.findUniqueOrThrow({
        where: { id: point.revisionId },
      });
      expect(stored.revisionKey).toBe(point.revisionKey);
      expect(target.target.pointRevision).toBe(point.revisionKey);
      expect(await f.db.keyword.count()).toBe(1);
    } finally {
      await f.close();
    }
  }, 120_000);
  it("does not invalidate execution axes for an unrelated topic edit", async () => {
    const f = await localMeasurementDatabase();
    try {
      const target = await f.target();
      await f.db.keyword.update({
        where: { id: f.keyword.id },
        data: { topic: "Synthetic display grouping" },
      });
      expect(
        (await prepareLocalMeasurementRun(f.launch([target]), f.writerContext, f.ports, f.db))
          .fresh,
      ).toBe(true);
    } finally {
      await f.close();
    }
  }, 120_000);
  it("rechecks price before dispatch and retains the owner after a failed producer fence", async () => {
    const f = await localMeasurementDatabase();
    try {
      const target = await f.target();
      const prepared = await prepareLocalMeasurementRun(
        f.launch([target]),
        f.writerContext,
        f.ports,
        f.db,
      );
      f.ports.adapter.providerPriceVersion = "synthetic-price-changed";
      await expect(prepared.submitters[0].submit()).rejects.toThrow("Capability or price changed");
      expect(f.counters.submissions).toBe(0);
      expect(await f.db.localMeasurementTargetOwner.count()).toBe(1);
    } finally {
      await f.close();
    }
  }, 120_000);
});
