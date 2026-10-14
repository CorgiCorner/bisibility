import { randomUUID } from "node:crypto";
import { makePublicId } from "@/lib/db/public-id-resources";
import { materializeMonitorTargets } from "@/lib/local-monitor-launch/targets";
import { mapsPolicy } from "@/lib/local-monitoring-host/maps-policy";
import { localProjectScope } from "@/lib/local-monitoring-store/access";
import {
  localKeywordRevision,
  localKeywordSourceHash,
} from "@/lib/local-monitoring-store/canonical";
import { localKeywordSelect } from "@/lib/local-monitoring-store/repository";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { monitorDatabase } from "./postgres.test-fixture";
import { readLocalMonitor } from "./read";
import { loadMonitorSnapshot } from "./snapshot";
import { createLocalMonitor } from "./write";

const suite = describe.skipIf(!process.env.PROVIDER_UI_TEST_DATABASE_URL);
const transport = vi.fn<typeof fetch>(async () => {
  throw new Error("Epoch projection, target creation and read must never call a provider.");
});
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", transport);
});
afterEach(() => vi.unstubAllGlobals());

async function fixture() {
  const f = await monitorDatabase();
  try {
    const made = await createLocalMonitor(
      {
        ...f.command,
        definition: {
          ...f.command.definition,
          axes: { ...f.command.definition.axes, operatingSystem: "windows" },
        },
      },
      f.writerContext,
      { db: f.db },
    );
    const snapshot = await f.db.$transaction((tx) =>
      loadMonitorSnapshot(tx, f.project.id, made.receipt.monitorId),
    );
    const current = () =>
      f.db.keyword.findUniqueOrThrow({ where: { id: f.keyword.id }, select: localKeywordSelect });
    const read = () =>
      readLocalMonitor(
        { projectId: f.project.publicId, monitorId: made.receipt.monitorId },
        f.writerContext,
        f.db,
      );
    const targets = () =>
      f.db.$transaction(async (tx) => {
        const scope = await localProjectScope(tx, f.writerContext, f.project.publicId, "create");
        return materializeMonitorTargets(
          tx,
          scope,
          snapshot.definition,
          mapsPolicy(scope.project.id, snapshot.definition),
        );
      });
    const noPaidWork = async () => {
      const rows = await f.client.query<{ operations: number; runs: number; jobs: number }>(`SELECT
        (SELECT count(*)::integer FROM public.metering_operation) AS operations,
        (SELECT count(*)::integer FROM public.local_measurement_runs) AS runs,
        (SELECT count(*)::integer FROM public.local_monitor_launch_intents) AS jobs`);
      expect(rows.rows[0]).toEqual({ operations: 0, runs: 0, jobs: 0 });
      expect(transport).not.toHaveBeenCalled();
    };
    return { ...f, made, snapshot, current, read, targets, noPaidWork };
  } catch (error) {
    await f.close();
    throw error;
  }
}

suite("actual whole-schema Local keyword target/policy epoch projections", () => {
  it("captures real BigInt scalars into lossless definition/target JSON and rejects target A → B → A", async () => {
    const f = await fixture();
    try {
      const initial = await f.current();
      expect(typeof initial.measurementTargetEpoch).toBe("bigint");
      expect(typeof initial.measurementPolicyEpoch).toBe("bigint");
      expect(initial).not.toHaveProperty("measurementEpoch");
      expect(f.snapshot.definition.keywords[0]).toMatchObject({
        measurementTargetEpoch: String(initial.measurementTargetEpoch),
        measurementPolicyEpoch: String(initial.measurementPolicyEpoch),
      });
      expect((await f.read()).readiness.configurationCurrent).toBe(true);
      const targets = await f.targets();
      expect(targets).toHaveLength(9);
      for (const target of targets)
        expect(target.target.keywordRevision).toBe(localKeywordRevision(initial));
      const retained = await f.db.localMeasurementTarget.findMany({
        where: { projectId: f.project.id },
        select: { keywordSnapshot: true },
      });
      expect(retained).toHaveLength(9);
      for (const row of retained) {
        expect(row.keywordSnapshot).toMatchObject({
          measurementTargetEpoch: String(initial.measurementTargetEpoch),
          measurementPolicyEpoch: String(initial.measurementPolicyEpoch),
        });
        expect(row.keywordSnapshot).not.toHaveProperty("measurementEpoch");
        expect(() => JSON.stringify(row.keywordSnapshot)).not.toThrow();
      }
      await f.db.keyword.update({
        where: { id: f.keyword.id },
        data: { text: `${initial.text} ${randomUUID()}` },
      });
      await f.db.keyword.update({ where: { id: f.keyword.id }, data: { text: initial.text } });
      const restored = await f.current();
      if (initial.device !== "desktop" || restored.device !== "desktop")
        throw new Error("Fixture keyword device changed.");
      expect(localKeywordSourceHash(initial)).toBe(localKeywordSourceHash(restored));
      expect(restored.measurementTargetEpoch).toBe(initial.measurementTargetEpoch + 2n);
      expect(restored.measurementPolicyEpoch).toBe(initial.measurementPolicyEpoch);
      expect(localKeywordRevision(restored)).not.toBe(localKeywordRevision(initial));
      expect((await f.read()).readiness.reasons).toContain("keyword_changed");
      await expect(f.targets()).rejects.toThrow(/changed|review/i);
      expect(await f.db.localMeasurementTarget.count()).toBe(9);
      await f.noPaidWork();
    } finally {
      await f.close();
    }
  }, 120000);

  it("rejects policy A → B → A independently without changing the keyword target epoch", async () => {
    const f = await fixture();
    try {
      const initial = await f.current();
      const schedule = await f.db.checkSchedule.create({
        data: {
          projectId: f.project.id,
          publicId: makePublicId("sch"),
          name: "Epoch-only synthetic calendar",
          frequency: "daily",
          timeOfDay: "10:00",
          timezone: "UTC",
          jitterMinutes: 0,
        },
      });
      await f.db.keyword.update({
        where: { id: f.keyword.id },
        data: { checkScheduleId: schedule.id },
      });
      await f.db.keyword.update({ where: { id: f.keyword.id }, data: { checkScheduleId: null } });
      const restored = await f.current();
      expect(restored.measurementTargetEpoch).toBe(initial.measurementTargetEpoch);
      expect(restored.measurementPolicyEpoch).toBe(initial.measurementPolicyEpoch + 2n);
      expect(localKeywordRevision(restored)).not.toBe(localKeywordRevision(initial));
      expect((await f.read()).readiness.reasons).toContain("keyword_changed");
      await expect(f.targets()).rejects.toThrow(/changed|review/i);
      expect(await f.db.localMeasurementTarget.count()).toBe(0);
      await f.noPaidWork();
    } finally {
      await f.close();
    }
  }, 120000);
});
