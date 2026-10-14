import { exportLocalRunResult } from "@/lib/local-monitor-results/export";
import { readMonitorPointListings, readMonitorRunResult } from "@/lib/local-monitor-results/read";
import { expect } from "vitest";
import type { positiveRecurringDatabase } from "./positive.postgres.test-fixture";

/** Actual persisted original-match and read/export proof; caller owns transport counters. */
export async function assertPositiveRunResult(
  f: Awaited<ReturnType<typeof positiveRecurringDatabase>>,
  monitorId: string,
  occurrences: number,
) {
  // Keep provider observation time; include the owned DB's actual recorded timestamps.
  const {
    rows: [savedRun],
  } = await f.client.query<{ runId: string; asOf: Date }>(
    `SELECT "publicId" AS "runId",greatest(clock_timestamp(),$2::timestamptz) AS "asOf" FROM public.local_measurement_runs WHERE "projectId"=$1 ORDER BY "createdAt" DESC LIMIT 1`,
    [f.project.id, new Date()],
  );
  if (!savedRun) throw new Error("Collected run missing.");
  const command = {
    projectId: f.project.publicId,
    monitorId,
    runId: savedRun.runId,
    asOf: savedRun.asOf.toISOString(),
  };
  const options = { db: f.db, now: savedRun.asOf };
  const report = await readMonitorRunResult(command, f.writerContext, options);
  expect(
    await f.db.businessMatchDecision.count({
      where: {
        projectId: f.project.id,
        decisionRevision: 1,
        source: "automatic",
        status: "confirmed",
      },
    }),
  ).toBe(occurrences * 9);
  expect(report).toMatchObject({
    points: Array(9).fill({
      position: 3,
      observedPosition: 3,
      evidence: "positive",
      identityMatch: "confirmed",
      scopeClass: "coordinate_seed",
      freshness: "unknown",
    }),
    grids: [
      {
        expected: 9,
        observedRate: 1,
        observedCoverage: 1,
        dataCoverage: null,
        sampleBounds: null,
        counts: { metricEligible: 9, knownAbsent: 0 },
      },
    ],
  });
  expect(
    await readMonitorPointListings(
      { ...command, targetId: report.points[0].id },
      f.writerContext,
      options,
    ),
  ).toMatchObject([{ rankGroup: 3, matched: "confirmed" }]);
  expect(JSON.parse(exportLocalRunResult(report, "json").text)).toMatchObject({
    report: "local-point-report-v1",
    points: report.points,
    grids: report.grids,
  });
  expect(exportLocalRunResult(report, "csv").text.split("\r\n")).toHaveLength(11);
}
