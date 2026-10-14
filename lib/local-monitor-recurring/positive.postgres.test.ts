import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@/lib/generated/prisma/client";
import { executeMonitorJob } from "@/lib/local-monitor-worker/runtime";
import { submissionRecordSchema } from "@/lib/local-monitoring-store/schema";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { positiveRecurringDatabase } from "./positive.postgres.test-fixture";
import { assertPositiveRunResult } from "./positive.results.test-fixture";
import { produceRecurringOccurrence } from "./produce-one";
import { produceDueRecurringMonitors } from "./producer";

const owned = vi.hoisted(() => ({ db: null as PrismaClient | null }));
// Existing global host composition is redirected to this same real owned DB, never mocked tables.
vi.mock("@/lib/db/prisma", () => ({
  prisma: new Proxy(
    {},
    {
      get(_target, property) {
        if (!owned.db) throw new Error("Owned recurring DB is not bound.");
        const value = Reflect.get(owned.db, property, owned.db);
        return typeof value === "function" ? value.bind(owned.db) : value;
      },
    },
  ),
}));
vi.mock("@/lib/worker-intents/realtime", () => ({
  publishWorkerIntent: async () => ({ mode: "polling", ok: true }),
}));
const suite = describe.skipIf(!process.env.PROVIDER_UI_TEST_DATABASE_URL);
const bodySchema = z.array(z.record(z.string(), z.unknown())).length(1);
function fakeTransport(unknownFirst = false) {
  const originals = new Map<string, Record<string, unknown>>();
  let posts = 0,
    gets = 0;
  const fetcher = vi.fn<typeof fetch>(async (input, init) => {
    const request = new Request(input, init),
      url = new URL(request.url);
    if (url.origin !== "https://api.dataforseo.com")
      throw new Error("Unexpected synthetic transport destination.");
    if (request.method === "POST" && url.pathname === "/v3/serp/google/maps/task_post") {
      posts += 1;
      const [body] = bodySchema.parse(await request.json());
      if (unknownFirst && posts === 1)
        throw new Error("Synthetic lost acceptance after possible-send.");
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
      throw new Error("Collection must use one original accepted ID.");
    gets += 1;
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
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  // Deliberate captured price-window clock, independent of the common July unit clock.
  vi.setSystemTime(new Date("2026-10-12T12:00:00.000Z"));
  vi.stubEnv("BISIBILITY_SECRETS_KEY", Buffer.alloc(32, 9).toString("base64"));
  vi.stubEnv("SCHEDULER_DRIVER", "worker");
  vi.stubEnv("LOCAL_MONITOR_RECURRING_ENABLED", "true");
  vi.stubEnv("DATAFORSEO_QUEUE_POLL_INTERVAL_SECONDS", "60");
  vi.stubEnv("DATAFORSEO_QUEUE_MAX_AGE_SECONDS", "3600");
});
afterEach(() => {
  owned.db = null;
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});
suite("positive recurring original-worker flow on the actual full schema", () => {
  it("approves without I/O, queues once, admits/submits/collects/settles two distinct slots and replays without rebuy", async () => {
    const transport = fakeTransport(),
      f = await positiveRecurringDatabase();
    owned.db = f.db;
    try {
      const approval = await f.approve();
      expect(approval.reviewed.expectedCount).toBe(9);
      expect(approval.reviewed.command.quote.nativeEstimates).toContainEqual({
        unit: "cents",
        amount: "0.54",
      });
      expect(approval.reviewed.command.calendar.timezone).toBe("America/New_York");
      expect(transport.counts()).toEqual({ posts: 0, gets: 0 });
      expect(await f.db.localMeasurementRun.count()).toBe(0);
      const ids: string[] = [];
      for (let slot = 0; slot < 2; slot += 1) {
        const cursor = await f.cursor(approval.id);
        vi.setSystemTime(new Date(cursor.nextDueAt.getTime() + 1));
        const produced = await produceDueRecurringMonitors({ db: f.db });
        expect(
          produced,
          JSON.stringify({ slot, cursor: await f.cursor(approval.id) }),
        ).toMatchObject({ queued: 1 });
        expect(await produceDueRecurringMonitors({ db: f.db })).toMatchObject({ queued: 0 });
        expect(transport.counts().posts).toBe(slot * 9);
        const jobs = await f.jobs(approval.id);
        expect(jobs).toHaveLength(slot + 1);
        const job = jobs.at(-1);
        if (!job) throw new Error("Due worker job missing.");
        ids.push(job.id);
        expect(job.command).not.toHaveProperty("consentToken");
        expect(await executeMonitorJob(job.id, f.db)).toEqual({
          state: "complete",
          nextPollMs: null,
        });
        expect(await executeMonitorJob(job.id, f.db)).toEqual({
          state: "complete",
          nextPollMs: null,
        });
        expect(transport.counts()).toEqual({ posts: (slot + 1) * 9, gets: (slot + 1) * 9 });
        await assertPositiveRunResult(f, approval.monitorId, slot + 1);
        const stored = await f.storedRead(approval.monitorId);
        expect(stored.approval?.issuedOccurrences).toBe(slot + 1);
        expect(transport.counts()).toEqual({ posts: (slot + 1) * 9, gets: (slot + 1) * 9 });
      }
      expect(new Set(ids).size).toBe(2);
      const bindings = await f.client.query<{
        mode: string;
        runTrigger: string;
        actorId: string;
        principal: string;
        state: string;
        fenced: boolean;
      }>(
        `SELECT o.mode,r.trigger AS "runTrigger",o."actorId",m.principal,m.state,c.fenced_at IS NOT NULL AS fenced FROM public.local_monitor_occurrences o JOIN public.local_measurement_runs r ON r.id=o."runId" AND r."projectId"=o."projectId" JOIN public.local_measurement_run_items i ON i."runId"=r.id JOIN public.metering_operation m ON m.namespace=i.namespace AND m.operation_id=i."preparedAttemptId" JOIN public.metering_paid_attempt_context c ON c.namespace=m.namespace AND c.operation_id=m.operation_id WHERE o."projectId"=$1`,
        [f.project.id],
      );
      expect(bindings.rows).toHaveLength(18);
      for (const row of bindings.rows)
        expect(row).toEqual({
          mode: "scheduled",
          runTrigger: "scheduled",
          actorId: f.writer.id,
          principal: f.owner.id,
          state: "settled",
          fenced: true,
        });
      expect(await f.db.observationRun.count({ where: { projectId: f.project.id } })).toBe(18);
      const observed = await f.db.observationItem.findMany({
        where: { observationRun: { projectId: f.project.id } },
      });
      for (const row of observed)
        expect(row).toMatchObject({
          rankGroup: 3,
          cid: "18446744073709551615",
          resultKind: "map_listing",
        });
      expect(await f.db.localMeasurementTargetOwner.count()).toBe(0);
      expect((await f.cursor(approval.id)).usedCents).toMatch(/^1\.08(?:0*)$/u);
    } finally {
      owned.db = null;
      await f.close();
    }
  }, 120000);
  it("a lost original receipt retains its target and never rebuy on replay or a later due slot", async () => {
    const transport = fakeTransport(true),
      f = await positiveRecurringDatabase();
    owned.db = f.db;
    try {
      const approval = await f.approve(),
        cursor = await f.cursor(approval.id);
      vi.setSystemTime(new Date(cursor.nextDueAt.getTime() + 1));
      expect(await produceRecurringOccurrence(approval.id, f.db, new Date())).toBe("queued");
      const [job] = await f.jobs(approval.id);
      if (!job) throw new Error("Original scheduled job missing.");
      await executeMonitorJob(job.id, f.db);
      const rows = await f.db.localMeasurementRunItem.findMany({
        where: { projectId: f.project.id },
      });
      expect(
        rows
          .map((row) => submissionRecordSchema.parse(row.record))
          .filter((row) => row.status === "unknown_acceptance"),
      ).toHaveLength(1);
      expect(await f.db.localMeasurementTargetOwner.count()).toBe(1);
      const before = transport.counts();
      await executeMonitorJob(job.id, f.db);
      expect(transport.counts()).toEqual(before);
      const next = await f.cursor(approval.id);
      vi.setSystemTime(new Date(next.nextDueAt.getTime() + 1));
      expect(await produceDueRecurringMonitors({ db: f.db })).toMatchObject({ queued: 0 });
      expect(await f.jobs(approval.id)).toHaveLength(1);
      expect((await f.cursor(approval.id)).issuedOccurrences).toBe(1);
      expect(transport.counts().posts).toBe(9);
    } finally {
      owned.db = null;
      await f.close();
    }
  }, 120000);
  it("real SQL selects the independent26th after25 original retained tasksets without altering their authority", async () => {
    const transport = fakeTransport(),
      f = await positiveRecurringDatabase();
    owned.db = f.db;
    try {
      const held = [];
      for (let n = 0; n < 25; n += 1) held.push(await f.approve(`Retained ${n}`));
      const initialCursors = await Promise.all(held.map((approval) => f.cursor(approval.id)));
      // Monitor phases differ within this real cron window; advance past the entire cohort.
      vi.setSystemTime(
        new Date(Math.max(...initialCursors.map((row) => row.nextDueAt.getTime())) + 1),
      );
      for (const approval of held) {
        expect(await produceRecurringOccurrence(approval.id, f.db, new Date())).toBe("queued");
        const [job] = await f.jobs(approval.id);
        if (!job) throw new Error("Held original job missing.");
        await f.holdOriginal(job.id);
      }
      const before = await f.client.query(
        `SELECT * FROM public.local_monitor_recurring_cursors ORDER BY "approvalId"`,
      );
      expect(await f.db.localMeasurementTargetOwner.count()).toBe(25 * 9);
      // Leave the real retained first25 at minute2, and create an independent next-due minute3.
      const retainedCursors = await Promise.all(held.map((approval) => f.cursor(approval.id)));
      vi.setSystemTime(
        new Date(Math.max(...retainedCursors.map((row) => row.nextDueAt.getTime())) + 1),
      );
      const eligible = await f.approve("Independent26th");
      const due = await f.cursor(eligible.id);
      vi.setSystemTime(new Date(due.nextDueAt.getTime() + 1));
      expect(await produceDueRecurringMonitors({ db: f.db })).toMatchObject({ queued: 1 });
      expect(await f.jobs(eligible.id)).toHaveLength(1);
      const after = await f.client.query(
        `SELECT * FROM public.local_monitor_recurring_cursors WHERE "approvalId"<>$1 ORDER BY "approvalId"`,
        [eligible.id],
      );
      expect(after.rows).toEqual(before.rows);
      expect(await f.db.localMeasurementTargetOwner.count()).toBe(25 * 9);
      expect(transport.counts()).toEqual({ posts: 0, gets: 0 });
    } finally {
      owned.db = null;
      await f.close();
    }
  }, 240000);
});
