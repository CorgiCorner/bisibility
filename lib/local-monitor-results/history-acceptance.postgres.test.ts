import "./acceptance.postgres.test-runtime";
import { randomUUID } from "node:crypto";
import { AuthorizationError } from "@/lib/auth/authorize";
import { makePublicId } from "@/lib/db/public-id-resources";
import { setLocalMonitorScheduleIntent } from "@/lib/local-monitor-store/schedule";
import { reviseLocalMonitor } from "@/lib/local-monitor-store/write";
import { describe, expect, it } from "vitest";
import { resultsAcceptanceDatabase } from "./acceptance.postgres.test-fixture";
import { acceptanceTransport } from "./acceptance.postgres.test-transport";
import { LocalResultUnavailableError } from "./errors";
import { exportLocalRunResult } from "./export";
import { readMonitorRunHistory } from "./history";
import { readMonitorPointHistory } from "./point-history";
import { readMonitorRunResult } from "./read";

const suite = describe.skipIf(!process.env.PROVIDER_UI_TEST_DATABASE_URL);
suite("actual Local retained occurrence windows, paging and frozen cohorts", () => {
  it("pages21 original runs20+1, excludes later arrivals from the frozen cursor and rechecks revoked access", async () => {
    const transport = acceptanceTransport(),
      f = await resultsAcceptanceDatabase();
    try {
      const monitor = await f.monitor(),
        runs = [];
      for (let index = 0; index < 21; index += 1) runs.push(await f.launch(monitor.monitorId));
      expect(transport.counts()).toEqual({ posts: 21, gets: 21 });
      const intentsBeforeRead = await f.db.localMonitorLaunchIntent.findMany({
        where: { projectId: f.project.id },
        orderBy: { id: "asc" },
      });
      const options = await f.readOptions(),
        base = {
          projectId: f.project.publicId,
          monitorId: monitor.monitorId,
          asOf: options.now.toISOString(),
        };
      const first = await readMonitorRunHistory(base, f.writerContext, options);
      expect(first.items).toHaveLength(20);
      if (!first.nextCursor) throw new Error("Actual21-run cursor missing.");
      const windowFirst = runs[8],
        windowLast = runs[12];
      if (!windowFirst || !windowLast) throw new Error("Known five-run window missing");
      const window = {
          from: windowFirst.occurrence.createdAt.toISOString(),
          to: windowLast.occurrence.createdAt.toISOString(),
        },
        bounded = await readMonitorRunHistory({ ...base, ...window }, f.writerContext, options);
      expect(bounded.eligibleTotal).toBe(5);
      expect(new Set(bounded.items.map((row) => row.runId))).toEqual(
        new Set(runs.slice(8, 13).map((row) => row.run.publicId)),
      );
      expect(bounded.window).toEqual({ ...window, timeBasis: "occurrence_created_at" });
      expect(transport.counts()).toEqual({ posts: 21, gets: 21 });
      const initial = runs[0];
      if (!initial) throw new Error("Original run missing.");
      const past = await readMonitorRunHistory(
        { ...base, asOf: initial.command.asOf },
        f.writerContext,
        options,
      );
      expect(past.items.map((row) => row.runId)).toEqual([initial.run.publicId]);
      const before = new Date(initial.occurrence.createdAt.getTime() - 1).toISOString();
      expect(
        (await readMonitorRunHistory({ ...base, asOf: before }, f.writerContext, options)).items,
      ).toEqual([]);
      const later = runs.at(-1);
      if (!later) throw new Error("Later original run missing.");
      await expect(
        readMonitorRunResult(
          { ...later.command, asOf: initial.command.asOf },
          f.writerContext,
          options,
        ),
      ).rejects.toBeInstanceOf(LocalResultUnavailableError);
      const target = initial.report.points[0];
      if (!target) throw new Error("Original captured point missing.");
      const point = await readMonitorPointHistory(
        { ...initial.command, asOf: base.asOf, targetId: target.id },
        f.writerContext,
        options,
      );
      expect(point).toMatchObject({ limit: 20, hasMore: true, scope: "exact_captured_target" });
      expect(point.items).toHaveLength(20);
      if (!point.nextCursor) throw new Error("Actual21-point history continuation missing");
      const earlierPoint = await readMonitorPointHistory(
        { ...initial.command, asOf: base.asOf, targetId: target.id, cursor: point.nextCursor },
        f.writerContext,
        options,
      );
      expect(earlierPoint.items).toHaveLength(1);
      expect(earlierPoint.nextCursor).toBeNull();
      expect(new Set([...point.items, ...earlierPoint.items].map((item) => item.id)).size).toBe(21);
      expect(point.items.every((row) => row.position === 3 && row.evidence === "positive")).toBe(
        true,
      );
      expect(
        await f.db.localMonitorLaunchIntent.findMany({
          where: { projectId: f.project.id },
          orderBy: { id: "asc" },
        }),
      ).toEqual(intentsBeforeRead);
      expect(transport.counts()).toEqual({ posts: 21, gets: 21 });
      const additional = await f.launch(monitor.monitorId),
        now = await f.readOptions();
      const last = await readMonitorRunHistory(
        { ...base, cursor: first.nextCursor },
        f.writerContext,
        now,
      );
      expect(last.asOf).toBe(first.asOf);
      expect(last.items).toHaveLength(1);
      expect(last.nextCursor).toBeNull();
      const selected = [...first.items, ...last.items].map((row) => row.runId);
      expect(new Set(selected).size).toBe(21);
      expect(selected).not.toContain(additional.run.publicId);
      expect(new Set(selected)).toEqual(new Set(runs.map((row) => row.run.publicId)));
      const current = await readMonitorRunHistory(
        { projectId: base.projectId, monitorId: base.monitorId },
        f.writerContext,
        now,
      );
      expect(current.items.map((row) => row.runId)).toContain(additional.run.publicId);
      const other = await f.monitor({ ...f.definition, name: "Other frozen monitor" });
      await expect(
        readMonitorRunHistory(
          { ...base, monitorId: other.monitorId, cursor: first.nextCursor },
          f.writerContext,
          now,
        ),
      ).rejects.toBeInstanceOf(LocalResultUnavailableError);
      await f.db.membership.delete({
        where: { userId_projectId: { userId: f.writer.id, projectId: f.project.id } },
      });
      await expect(
        readMonitorRunHistory({ ...base, cursor: first.nextCursor }, f.writerContext, now),
      ).rejects.toBeInstanceOf(AuthorizationError);
      expect(transport.counts()).toEqual({ posts: 22, gets: 22 });
    } finally {
      await f.close();
    }
  }, 240000);

  it("keeps an original two-keyword cohort/point/quality in history and exports after a one-keyword grid revision", async () => {
    const transport = acceptanceTransport(),
      f = await resultsAcceptanceDatabase();
    try {
      const extra = await f.db.keyword.create({
        data: {
          projectId: f.project.id,
          publicId: makePublicId("kw"),
          text: "=Captured extra",
          location: f.keyword.location,
          locationId: f.keyword.locationId,
          device: "desktop",
        },
      });
      transport.sample(extra.text, "missing_time");
      const monitor = await f.monitor({
        ...f.definition,
        keywordIds: [f.keyword.publicId, extra.publicId],
      });
      const original = await f.launch(monitor.monitorId);
      expect(original.report.points).toHaveLength(2);
      const positive = original.report.points.find((row) => row.keywordId === f.keyword.publicId);
      const unknown = original.report.points.find((row) => row.keywordId === extra.publicId);
      if (!positive || !unknown) throw new Error("Full original captured cohort missing.");
      expect(positive).toMatchObject({
        evidence: "positive",
        position: 3,
        identityMatch: "confirmed",
      });
      expect(unknown).toMatchObject({
        evidence: "unknown",
        position: null,
        reason: "missing_observation_time",
      });
      expect(
        original.report.grids.every((grid) => grid.expected === 1 && grid.counts.knownAbsent === 0),
      ).toBe(true);
      await f.db.keyword.update({
        where: { id: f.keyword.id },
        data: { text: "Current renamed dentist" },
      });
      await f.db.keyword.update({ where: { id: extra.id }, data: { archivedAt: new Date() } });
      const current = await f.db.localMonitor.findUniqueOrThrow({
        where: { publicId: monitor.monitorId },
      });
      const revised = await reviseLocalMonitor(
        {
          projectId: f.project.publicId,
          monitorId: monitor.monitorId,
          expectedVersion: current.version,
          idempotencyKey: randomUUID(),
          definition: {
            ...f.definition,
            keywordIds: [f.keyword.publicId],
            grid: { ...f.definition.grid, latitude: "-12.3456789", longitude: "-0.0000001" },
            axes: { ...f.definition.axes, operatingSystem: "macos" },
          },
        },
        f.writerContext,
        { db: f.db },
      );
      expect(revised.receipt.version).toBeGreaterThan(monitor.version);
      // A revised definition needs its own explicit manual intent; old consent is never reused.
      await setLocalMonitorScheduleIntent(
        {
          projectId: f.project.publicId,
          monitorId: monitor.monitorId,
          expectedVersion: revised.receipt.version,
          idempotencyKey: randomUUID(),
          mode: "manual",
          scheduleId: null,
          expectedScheduleEpoch: null,
          consentToken: null,
        },
        f.writerContext,
        f.consent,
        { db: f.db },
      );
      const next = await f.launch(monitor.monitorId),
        options = await f.readOptions();
      expect(next.report.points).toHaveLength(1);
      expect(next.report.points[0]).toMatchObject({
        keyword: "Current renamed dentist",
        latitude: "-12.3456789",
        longitude: "-0.0000001",
        operatingSystem: "macos",
        evidence: "positive",
      });
      const retained = await readMonitorRunResult(original.command, f.writerContext, options);
      expect(retained.points).toEqual(original.report.points);
      expect(retained.definitionRevisionId).not.toBe(next.report.definitionRevisionId);
      const history = await readMonitorPointHistory(
        { ...original.command, asOf: options.now.toISOString(), targetId: positive.id },
        f.writerContext,
        options,
      );
      expect(history.items.map((row) => row.runId)).toEqual([original.run.publicId]);
      const nextTarget = next.report.points[0];
      if (!nextTarget) throw new Error("New revision target missing.");
      await expect(
        readMonitorPointHistory(
          { ...original.command, targetId: nextTarget.id },
          f.writerContext,
          options,
        ),
      ).rejects.toBeInstanceOf(LocalResultUnavailableError);
      const json = JSON.parse(exportLocalRunResult(retained, "json").text);
      expect(json).toMatchObject({
        report: "local-point-report-v1",
        asOf: original.command.asOf,
        definitionRevisionId: retained.definitionRevisionId,
        points: retained.points,
        grids: retained.grids,
      });
      const csv = exportLocalRunResult(retained, "csv").text;
      expect(csv.split("\r\n")).toHaveLength(4);
      expect(csv).toContain("'=Captured extra");
      expect(exportLocalRunResult(next.report, "csv").text).toContain('"-12.3456789","-0.0000001"');
      expect(transport.counts()).toEqual({ posts: 3, gets: 3 });
    } finally {
      await f.close();
    }
  }, 120000);
});
