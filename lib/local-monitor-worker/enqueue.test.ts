import { prisma } from "@/lib/db/prisma";
import { signMonitorConsent } from "@/lib/local-monitor-launch/consent";
import { occurrenceBody } from "@/lib/local-monitor-launch/identity";
import { command, now } from "@/lib/local-monitor-launch/launch.test-fixture";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { enqueueMonitorLaunch } from "./enqueue";

const f = vi.hoisted(() => ({
  scope: vi.fn(),
  snapshot: vi.fn(),
  query: vi.fn(),
  execute: vi.fn(),
  load: vi.fn(),
  publish: vi.fn(),
  audit: vi.fn(),
  events: [] as string[],
}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
      f.events.push("begin");
      const result = await fn({ $queryRaw: f.query, $executeRaw: f.execute });
      f.events.push("commit");
      return result;
    },
  },
}));
vi.mock("@/lib/local-monitoring-store/access", () => ({ localProjectScope: f.scope }));
vi.mock("@/lib/local-monitor-launch/snapshot", () => ({
  currentMonitorLaunchSnapshot: f.snapshot,
}));
vi.mock("@/lib/auth/audit", () => ({ writeAudit: f.audit }));
vi.mock("@/lib/worker-intents/realtime", () => ({ publishWorkerIntent: f.publish }));
vi.mock("./repository", () => ({
  loadMonitorJob: f.load,
  approvalDigest: () => "c".repeat(64),
  publicMonitorIntent: (job: { publicId: string; state: string }) => ({
    id: job.publicId,
    state: job.state,
    expectedCount: 1,
  }),
}));
const stamp = "a".repeat(64);
function signed() {
  return {
    ...command,
    consentToken: signMonitorConsent(
      {
        actorId: "actor",
        projectId: "db-project",
        monitorId: command.monitorId,
        monitorVersion: command.expectedVersion,
        revisionId: command.revisionId,
        scheduleIntentId: command.scheduleIntentId,
        connectionId: command.connectionId,
        connectionStamp: stamp,
        targetIds: command.targetIds,
        idempotencyKey: command.idempotencyKey,
        quote: command.quote,
      },
      now,
    ).token,
  };
}
beforeEach(() => {
  vi.resetAllMocks();
  f.events.length = 0;
  process.env.BISIBILITY_SECRETS_KEY = Buffer.alloc(32, 9).toString("base64");
  process.env.SCHEDULER_DRIVER = "worker";
  f.scope.mockResolvedValue({ actor: { id: "actor" }, project: { id: "db-project" } });
  f.snapshot.mockResolvedValue({
    monitor: { id: "monitor" },
    revision: { id: command.revisionId },
    intent: { id: command.scheduleIntentId },
    connectionStamp: stamp,
  });
  f.query.mockResolvedValue([]);
  f.load.mockResolvedValue({
    id: "job",
    publicId: "lmj_aaaaaaaaaaaaaaaaaaaaaaaa",
    state: "queued",
  });
  f.publish.mockImplementation(async () => {
    f.events.push("wake");
  });
});
afterEach(() => {
  delete process.env.BISIBILITY_SECRETS_KEY;
  delete process.env.SCHEDULER_DRIVER;
});
describe("durable worker-only enqueue", () => {
  it("stores verified command without the raw token and wakes only after commit", async () => {
    const input = signed();
    expect(
      (await enqueueMonitorLaunch(input, { actor: { id: "actor" } }, prisma, () => now)).intent
        .state,
    ).toBe("queued");
    expect(f.execute).toHaveBeenCalledTimes(1);
    const values = f.execute.mock.calls[0].slice(1);
    expect(values).not.toContain(input.consentToken);
    const stored = values.find(
      (value) => typeof value === "string" && value.startsWith('{"projectId"'),
    );
    expect(typeof stored).toBe("string");
    expect(JSON.parse(String(stored))).not.toHaveProperty("consentToken");
    expect(f.audit).toHaveBeenCalledTimes(1);
    expect(f.events).toEqual(["begin", "commit", "wake"]);
  });
  it("rejects invalid or expired consent before persisting/waking", async () => {
    await expect(
      enqueueMonitorLaunch(
        { ...signed(), consentToken: "tampered" },
        { actor: { id: "actor" } },
        prisma,
        () => now,
      ),
    ).rejects.toThrow();
    await expect(
      enqueueMonitorLaunch(
        signed(),
        { actor: { id: "actor" } },
        prisma,
        () => new Date(command.quote.expiresAt),
      ),
    ).rejects.toThrow();
    expect(f.execute).not.toHaveBeenCalled();
    expect(f.publish).not.toHaveBeenCalled();
  });
  it("cannot accept a command when the real scope authorization is denied", async () => {
    f.scope.mockRejectedValue(new Error("denied"));
    await expect(
      enqueueMonitorLaunch(signed(), { actor: { id: "actor" } }, prisma, () => now),
    ).rejects.toThrow("denied");
    expect(f.snapshot).not.toHaveBeenCalled();
    expect(f.execute).not.toHaveBeenCalled();
  });
  it("replays the same queued command after consent expiry without another write", async () => {
    const input = signed();
    f.query.mockResolvedValue([{ id: "job" }]);
    f.load.mockResolvedValue({
      id: "job",
      publicId: "lmj_aaaaaaaaaaaaaaaaaaaaaaaa",
      state: "running",
      actorId: "actor",
      bodyHash: occurrenceBody(input, "actor"),
    });
    expect(
      (
        await enqueueMonitorLaunch(
          input,
          { actor: { id: "actor" } },
          prisma,
          () => new Date("2099-01-01"),
        )
      ).replayed,
    ).toBe(true);
    expect(f.execute).not.toHaveBeenCalled();
    expect(f.snapshot).not.toHaveBeenCalled();
  });
  it("does not claim queued success when execution is explicitly disabled", async () => {
    process.env.SCHEDULER_DRIVER = "none";
    await expect(
      enqueueMonitorLaunch(signed(), { actor: { id: "actor" } }, prisma, () => now),
    ).rejects.toThrow("worker_unavailable");
    expect(f.scope).not.toHaveBeenCalled();
    expect(f.publish).not.toHaveBeenCalled();
  });
});
