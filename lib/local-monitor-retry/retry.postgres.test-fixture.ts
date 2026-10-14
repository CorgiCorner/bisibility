import { randomUUID } from "node:crypto";
import { previewMonitorLaunch } from "@/lib/local-monitor-launch/preview";
import { resultsAcceptanceDatabase } from "@/lib/local-monitor-results/acceptance.postgres.test-fixture";
import { enqueueMonitorLaunch } from "@/lib/local-monitor-worker/enqueue";
import { executeMonitorJob } from "@/lib/local-monitor-worker/runtime";
import { resolveManualLocalDriver } from "@/lib/local-monitoring-host/manual-driver";
import {
  cancelLocalMeasurementRun,
  releaseCancelledUnsentLocalItem,
} from "@/lib/local-monitoring-store/cancel-run";
import { vi } from "vitest";
import { z } from "zod";
import { admitQueuedMonitor } from "./admit.test-fixture";

export function retryTransport(mixed = true) {
  const originals = new Map<string, Record<string, unknown>>();
  let posts = 0,
    gets = 0;
  const bodySchema = z.array(z.record(z.string(), z.unknown())).length(1);
  const fetcher = vi.fn<typeof fetch>(async (input, init) => {
    const request = new Request(input, init),
      url = new URL(request.url);
    if (url.origin !== "https://api.dataforseo.com")
      throw new Error("Only synthetic original Maps HTTP is permitted.");
    if (request.method === "POST" && url.pathname === "/v3/serp/google/maps/task_post") {
      const [body] = bodySchema.parse(await request.json());
      posts++;
      if (mixed && posts === 1)
        return Response.json({
          status_code: 20000,
          cost: 0,
          tasks_count: 1,
          tasks: [{ status_code: 40001, cost: 0 }],
        });
      if (mixed && posts === 2) throw new Error("Synthetic acceptance lost after possible send.");
      const id = randomUUID();
      originals.set(id, body);
      return Response.json({
        status_code: 20000,
        tasks_count: 1,
        cost: 0.0006,
        tasks: [{ id, status_code: 20100, cost: 0.0006, result: null }],
      });
    }
    const id = url.pathname.split("/").at(-1),
      body = id ? originals.get(id) : null;
    if (
      request.method !== "GET" ||
      !id ||
      !body ||
      url.pathname !== `/v3/serp/google/maps/task_get/advanced/${id}`
    )
      throw new Error("Only original accepted ID retrieval is permitted.");
    gets++;
    return Response.json({
      status_code: 20000,
      tasks_count: 1,
      cost: 0,
      tasks: [
        {
          id,
          status_code: 20000,
          cost: 0,
          path: ["v3", "serp", "google", "maps", "task_get", "advanced", id],
          data: { ...body, api: "serp", function: "task_get", se: "google", se_type: "maps" },
          result_count: 1,
          result: [
            {
              type: "maps",
              keyword: body.keyword,
              datetime: new Date().toISOString(),
              language_code: "en",
              spell: null,
              items_count: 1,
              items: [
                {
                  type: "maps_search",
                  rank_group: 3,
                  rank_absolute: 3,
                  cid: "18446744073709551615",
                  title: "Synthetic retained branch",
                },
              ],
            },
          ],
        },
      ],
    });
  });
  vi.stubGlobal("fetch", fetcher);
  return { fetcher, counts: () => ({ posts, gets }) };
}
export async function retryDatabase(unsent = false) {
  const f = await resultsAcceptanceDatabase();
  try {
    const monitor = await f.monitor({ ...f.definition, grid: { ...f.definition.grid, size: 3 } });
    const input = {
      projectId: f.project.publicId,
      monitorId: monitor.monitorId,
      expectedVersion: monitor.version,
      connectionId: f.connection.publicId,
      idempotencyKey: randomUUID(),
    };
    const preview = await previewMonitorLaunch(
      input,
      f.writerContext,
      resolveManualLocalDriver,
      f.db,
    );
    if (preview.kind !== "ready") throw new Error("Original Maps quote refused.");
    const queued = await enqueueMonitorLaunch(preview.command, f.writerContext, f.db);
    const job = await f.db.localMonitorLaunchIntent.findUniqueOrThrow({
      where: { publicId: queued.intent.id },
    });
    if (!unsent) await executeMonitorJob(job.id, f.db);
    else {
      const prepared = await admitQueuedMonitor(f, job.id);
      // The live native leases remain intact; cancellation proves no send before releasing them.
      await cancelLocalMeasurementRun(
        { projectId: f.project.publicId, runId: prepared.id, expectedVersion: 0 },
        f.writerContext,
        f.db,
      );
      const held = await f.db.localMeasurementRun.findUniqueOrThrow({
        where: { publicId: prepared.id },
      });
      const items = await f.db.localMeasurementRunItem.findMany({ where: { runId: held.id } });
      for (const item of items) {
        const target = await f.db.localMeasurementTarget.findUniqueOrThrow({
          where: { id: item.targetId },
        });
        await releaseCancelledUnsentLocalItem(
          { projectId: f.project.publicId, runId: prepared.id, targetId: target.publicId },
          f.writerContext,
          f.db,
        );
      }
    }
    const saved = await f.db.localMonitorLaunchIntent.findUniqueOrThrow({ where: { id: job.id } });
    if (!saved.runId) throw new Error("Original parent run was not admitted.");
    const parent = await f.db.localMeasurementRun.findUniqueOrThrow({ where: { id: saved.runId } });
    await f.readOptions(); // The frozen test clock follows the actual captured DB timestamps.
    return { ...f, monitor, input, parent, preview };
  } catch (error) {
    await f.close();
    throw error;
  }
}
