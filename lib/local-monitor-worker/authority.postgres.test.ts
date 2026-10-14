import { randomUUID } from "node:crypto";
import { makePublicId, requirePublicId } from "@/lib/db/public-id-resources";
import { signMonitorConsent } from "@/lib/local-monitor-launch/consent";
import { currentMonitorLaunchSnapshot } from "@/lib/local-monitor-launch/snapshot";
import { materializeMonitorTargets } from "@/lib/local-monitor-launch/targets";
import { monitorDatabase } from "@/lib/local-monitor-store/postgres.test-fixture";
import { createLocalMonitor } from "@/lib/local-monitor-store/write";
import type { LocalQuote } from "@/lib/local-monitoring/quote";
import { executionTargetKey } from "@/lib/local-monitoring/target-key";
import { localProjectScope } from "@/lib/local-monitoring-store/access";
import { localKeywordRevision } from "@/lib/local-monitoring-store/canonical";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { claimMonitorJob } from "./claim";
import { enqueueMonitorLaunch } from "./enqueue";
import { assertMonitorClaim } from "./repository";

vi.mock("@/lib/worker-intents/realtime", () => ({
  publishWorkerIntent: async () => ({ mode: "polling", ok: true }),
}));
const suite = describe.skipIf(!process.env.PROVIDER_UI_TEST_DATABASE_URL);
beforeEach(() => {
  vi.stubEnv("BISIBILITY_SECRETS_KEY", Buffer.alloc(32, 9).toString("base64"));
  vi.stubEnv("SCHEDULER_DRIVER", "worker");
  vi.stubEnv("DATAFORSEO_QUEUE_POLL_INTERVAL_SECONDS", "60");
  vi.stubEnv("DATAFORSEO_QUEUE_MAX_AGE_SECONDS", "3600");
});
afterEach(() => vi.unstubAllEnvs());
async function fixture() {
  const f = await monitorDatabase();
  try {
    const made = await createLocalMonitor(f.command, f.writerContext, { db: f.db });
    const now = new Date();
    const connection = await f.db.providerConnection.create({
      data: {
        publicId: makePublicId("conn"),
        projectId: f.project.id,
        provider: "dataforseo",
        kind: "serp",
        status: "connected",
        enabled: true,
        credentialSource: "own",
        credentialsEncrypted: "synthetic-queue-proof-not-a-provider-secret",
      },
    });
    const preview = {
      projectId: requirePublicId(f.project.publicId, "prj"),
      monitorId: requirePublicId(made.receipt.monitorId, "lmn"),
      expectedVersion: made.receipt.version,
      connectionId: requirePublicId(connection.publicId, "conn"),
      idempotencyKey: randomUUID(),
    };
    const frozen = await f.db.$transaction(async (tx) => {
      const scope = await localProjectScope(tx, f.writerContext, f.project.publicId, "create");
      const snapshot = await currentMonitorLaunchSnapshot(tx, scope, preview);
      const targets = await materializeMonitorTargets(tx, scope, snapshot.definition, {
        capture: async (_tx, { keyword }) => ({
          keywordRevision: localKeywordRevision(keyword),
          policyRevision: snapshot.revision.id,
        }),
        assertCurrent: async () => {},
      });
      return { snapshot, targets };
    });
    // Queue persistence only: the synthetic price/capability is never admitted or sent.
    const quote: LocalQuote = {
      version: 1,
      projectId: f.project.id,
      expectedTargetKeys: frozen.targets.map(({ target }) => executionTargetKey(target)),
      effectiveOptions: {},
      capabilityVersion: "synthetic-queue-only",
      provider: "dataforseo",
      adapterVersion: "synthetic-queue-only",
      providerPriceVersion: "synthetic-queue-only",
      nativeEstimates: [{ unit: "cents", amount: "0.54" }],
      issuedAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + 120000).toISOString(),
    };
    const binding = {
      actorId: f.writer.id,
      projectId: f.project.id,
      monitorId: preview.monitorId,
      monitorVersion: preview.expectedVersion,
      revisionId: frozen.snapshot.revision.id,
      scheduleIntentId: frozen.snapshot.intent.id,
      connectionId: preview.connectionId,
      connectionStamp: frozen.snapshot.connectionStamp,
      targetIds: frozen.targets.map(({ id }) => id),
      idempotencyKey: preview.idempotencyKey,
      quote,
    };
    const command = {
      ...preview,
      revisionId: binding.revisionId,
      scheduleIntentId: binding.scheduleIntentId,
      targetIds: binding.targetIds,
      quote,
      consentToken: signMonitorConsent(binding, now).token,
    };
    return { ...f, now, command };
  } catch (error) {
    await f.close();
    throw error;
  }
}
suite("persisted Local worker command authority", () => {
  it("retains one command on replay, no raw token, and no paid run", async () => {
    const f = await fixture();
    try {
      const first = await enqueueMonitorLaunch(f.command, f.writerContext, f.db, () => f.now);
      const replay = await enqueueMonitorLaunch(
        f.command,
        f.writerContext,
        f.db,
        () => new Date(f.now.getTime() + 180000),
      );
      expect(replay).toEqual({ ...first, replayed: true });
      const rows = await f.client.query(
        'SELECT command,"consentDigest" FROM public.local_monitor_launch_intents',
      );
      expect(rows.rows).toHaveLength(1);
      expect(rows.rows[0].command).not.toHaveProperty("consentToken");
      expect(rows.rows[0].consentDigest).toMatch(/^[a-f0-9]{64}$/);
      expect(await f.db.localMeasurementRun.count()).toBe(0);
      expect(await f.db.rankCheck.count()).toBe(0);
      await expect(
        enqueueMonitorLaunch(
          { ...f.command, idempotencyKey: randomUUID() },
          f.ownerContext,
          f.db,
          () => f.now,
        ),
      ).rejects.toThrow();
    } finally {
      await f.close();
    }
  }, 120000);
  it("rejects authority mutation and revokes stale worker claim tokens", async () => {
    const f = await fixture();
    try {
      await enqueueMonitorLaunch(f.command, f.writerContext, f.db, () => f.now);
      const rows = await f.client.query("SELECT id FROM public.local_monitor_launch_intents");
      const id = String(rows.rows[0].id);
      await expect(
        f.client.query(
          "UPDATE public.local_monitor_launch_intents SET command='{}'::jsonb,version=version+1 WHERE id=$1",
          [id],
        ),
      ).rejects.toThrow();
      const first = await claimMonitorJob(id, f.db, () => f.now);
      if (!first) throw new Error("First claim missing");
      expect(await claimMonitorJob(id, f.db, () => f.now)).toBeNull();
      const later = new Date(f.now.getTime() + 300001);
      const next = await claimMonitorJob(id, f.db, () => later);
      if (!next) throw new Error("Recovery claim missing");
      expect(next.generation).toBe(first.generation + 1);
      await expect(
        f.db.$transaction((tx) => assertMonitorClaim(tx, first, later)),
      ).rejects.toThrow();
      expect((await f.db.$transaction((tx) => assertMonitorClaim(tx, next, later))).id).toBe(id);
    } finally {
      await f.close();
    }
  }, 120000);
});
