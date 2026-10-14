import "./acceptance.postgres.test-runtime";
import { AuthorizationError } from "@/lib/auth/authorize";
import { seedBusinessProject } from "@/lib/business-location-store/postgres.test-fixture";
import { Prisma } from "@/lib/generated/prisma/client";
import { describe, expect, it } from "vitest";
import { resultsAcceptanceDatabase } from "./acceptance.postgres.test-fixture";
import { acceptanceTransport } from "./acceptance.postgres.test-transport";
import { exportLocalRunResult } from "./export";
import { readMonitorRunHistory } from "./history";
import { readMonitorPointHistory } from "./point-history";
import { readMonitorPointListings, readMonitorRunResult } from "./read";
import { exportLocalRunResultAction } from "./session-actions";

const suite = describe.skipIf(!process.env.PROVIDER_UI_TEST_DATABASE_URL);
suite("actual Local retention and fresh read/export authorization", () => {
  it("raw expiry preserves the report; normalized evidence loss retains the full unknown cohort and original finance", async () => {
    const transport = acceptanceTransport(),
      f = await resultsAcceptanceDatabase();
    try {
      const monitor = await f.monitor(),
        saved = await f.launch(monitor.monitorId);
      const original = exportLocalRunResult(saved.report, "json");
      const items = await f.db.localMeasurementRunItem.findMany({ where: { runId: saved.run.id } });
      const ids = items.flatMap((row) => (row.preparedAttemptId ? [row.preparedAttemptId] : []));
      const finance = await f.db.meteringOperation.findMany({
        where: { operation_id: { in: ids } },
      });
      expect(finance).toHaveLength(1);
      expect(finance[0]?.state).toBe("settled");
      await f.db.observationItem.updateMany({
        where: { observationRun: { projectId: f.project.id } },
        data: { rawFragment: Prisma.JsonNull },
      });
      const options = await f.readOptions();
      const retained = await readMonitorRunResult(saved.command, f.writerContext, options);
      expect(exportLocalRunResult(retained, "json")).toEqual(original);
      expect(
        await exportLocalRunResultAction({ ...saved.command, version: 1, format: "json" }),
      ).toEqual(original);
      await f.db.observationRun.deleteMany({
        where: {
          projectId: f.project.id,
          neutralExecutionItemId: { in: items.map((row) => row.id) },
        },
      });
      const missing = await readMonitorRunResult(
        saved.command,
        f.writerContext,
        await f.readOptions(),
      );
      expect(missing.points).toHaveLength(1);
      expect(missing.points[0]).toMatchObject({
        id: saved.report.points[0]?.id,
        evidence: "unknown",
        position: null,
        observedPosition: null,
        identityMatch: "unavailable",
      });
      expect(missing.grids[0]).toMatchObject({
        expected: 1,
        observedCoverage: 0,
        observedRate: null,
        dataCoverage: null,
        sampleBounds: null,
        counts: { knownAbsent: 0 },
      });
      expect(missing.points[0]?.evidence).not.toBe("known_absent");
      expect(JSON.parse(exportLocalRunResult(missing, "json").text).points).toHaveLength(1);
      expect(exportLocalRunResult(missing, "csv").text.split("\r\n")).toHaveLength(3);
      expect(
        await f.db.localMeasurementRunItem.findMany({ where: { runId: saved.run.id } }),
      ).toEqual(items);
      expect(
        await f.db.meteringOperation.findMany({ where: { operation_id: { in: ids } } }),
      ).toEqual(finance);
      expect(transport.counts()).toEqual({ posts: 1, gets: 1 });
    } finally {
      await f.close();
    }
  }, 120000);

  it("foreign membership and actual deactivation deny retained results/listings/history and session export without I/O", async () => {
    const transport = acceptanceTransport(),
      f = await resultsAcceptanceDatabase();
    try {
      const monitor = await f.monitor(),
        saved = await f.launch(monitor.monitorId),
        options = await f.readOptions();
      const point = saved.report.points[0];
      if (!point) throw new Error("Original point missing.");
      const foreign = await seedBusinessProject(f);
      await expect(
        readMonitorRunResult(saved.command, foreign.writerContext, options),
      ).rejects.toBeInstanceOf(AuthorizationError);
      expect(
        await exportLocalRunResultAction({ ...saved.command, version: 1, format: "csv" }),
      ).toEqual(exportLocalRunResult(saved.report, "csv"));
      await f.db.user.update({ where: { id: f.writer.id }, data: { deactivatedAt: new Date() } });
      await expect(
        readMonitorRunResult(saved.command, f.writerContext, options),
      ).rejects.toBeInstanceOf(AuthorizationError);
      await expect(
        readMonitorPointListings(
          { ...saved.command, targetId: point.id },
          f.writerContext,
          options,
        ),
      ).rejects.toBeInstanceOf(AuthorizationError);
      await expect(
        readMonitorPointHistory({ ...saved.command, targetId: point.id }, f.writerContext, options),
      ).rejects.toBeInstanceOf(AuthorizationError);
      await expect(
        readMonitorRunHistory(
          { projectId: f.project.publicId, monitorId: monitor.monitorId },
          f.writerContext,
          options,
        ),
      ).rejects.toBeInstanceOf(AuthorizationError);
      for (const format of ["csv", "json"] as const)
        await expect(
          exportLocalRunResultAction({ ...saved.command, version: 1, format }),
        ).rejects.toBeInstanceOf(AuthorizationError);
      expect(transport.counts()).toEqual({ posts: 1, gets: 1 });
    } finally {
      await f.close();
    }
  }, 120000);
});
