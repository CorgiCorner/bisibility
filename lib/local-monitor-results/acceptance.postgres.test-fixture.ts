import { randomUUID } from "node:crypto";
import { previewMonitorLaunch } from "@/lib/local-monitor-launch/preview";
import { positiveRecurringDatabase } from "@/lib/local-monitor-recurring/positive.postgres.test-fixture";
import type { MonitorDefinitionInput } from "@/lib/local-monitor-store/schema";
import { createLocalMonitor } from "@/lib/local-monitor-store/write";
import { enqueueMonitorLaunch } from "@/lib/local-monitor-worker/enqueue";
import { executeMonitorJob } from "@/lib/local-monitor-worker/runtime";
import { resolveManualLocalDriver } from "@/lib/local-monitoring-host/manual-driver";
import { vi } from "vitest";
import { bindAcceptanceDatabase } from "./acceptance.postgres.test-runtime";
import { readMonitorRunResult } from "./read";

/** Reuses the actual full schema, BYOK connection and ordinary budget bootstrap; no fabricated authority. */
export async function resultsAcceptanceDatabase() {
  const f = await positiveRecurringDatabase();
  bindAcceptanceDatabase(f.db, f.writer.id);
  async function readOptions() {
    const {
      rows: [row],
    } = await f.client.query<{ at: Date }>(`SELECT clock_timestamp() AS at`);
    if (!row) throw new Error("Actual owned DB clock is unavailable.");
    vi.setSystemTime(row.at);
    return { db: f.db, now: row.at };
  }
  const definition: MonitorDefinitionInput = {
    ...f.command.definition,
    grid: { ...f.command.definition.grid, size: 1 },
    axes: { ...f.command.definition.axes, operatingSystem: "windows" },
  };
  async function monitor(input: MonitorDefinitionInput = definition) {
    await readOptions();
    const created = await createLocalMonitor(
      { projectId: f.project.publicId, idempotencyKey: randomUUID(), definition: input },
      f.writerContext,
      { db: f.db },
    );
    return created.receipt;
  }
  async function launch(monitorId: string) {
    await readOptions();
    const current = await f.db.localMonitor.findUniqueOrThrow({ where: { publicId: monitorId } });
    const preview = await previewMonitorLaunch(
      {
        projectId: f.project.publicId,
        monitorId,
        expectedVersion: current.version,
        connectionId: f.connection.publicId,
        idempotencyKey: randomUUID(),
      },
      f.writerContext,
      resolveManualLocalDriver,
      f.db,
    );
    if (preview.kind !== "ready") throw new Error(`Actual Maps preview refused: ${preview.reason}`);
    const queued = await enqueueMonitorLaunch(preview.command, f.writerContext, f.db);
    const job = await f.db.localMonitorLaunchIntent.findUniqueOrThrow({
      where: { publicId: queued.intent.id },
    });
    const result = await executeMonitorJob(job.id, f.db);
    if (result.state !== "complete")
      throw new Error(`Actual original collection refused: ${result.state}`);
    const saved = await f.db.localMonitorLaunchIntent.findUniqueOrThrow({ where: { id: job.id } });
    if (!saved.runId) throw new Error("Actual collected occurrence has no original run.");
    const run = await f.db.localMeasurementRun.findUniqueOrThrow({ where: { id: saved.runId } });
    const occurrence = await f.db.localMonitorOccurrence.findFirstOrThrow({
      where: { projectId: f.project.id, runId: run.id },
    });
    const options = await readOptions();
    const command = {
      projectId: f.project.publicId,
      monitorId,
      runId: run.publicId,
      asOf: options.now.toISOString(),
    };
    return {
      command,
      options,
      run,
      occurrence,
      report: await readMonitorRunResult(command, f.writerContext, options),
    };
  }
  try {
    await readOptions();
    return { ...f, definition, monitor, launch, readOptions };
  } catch (error) {
    await f.close();
    throw error;
  }
}
