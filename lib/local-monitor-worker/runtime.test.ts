import { prisma } from "@/lib/db/prisma";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { executeMonitorJob } from "./runtime";

const f = vi.hoisted(() => ({
  claim: vi.fn(),
  load: vi.fn(),
  assert: vi.fn(),
  scope: vi.fn(),
  snapshot: vi.fn(),
  factory: vi.fn(),
  prepare: vi.fn(),
  execute: vi.fn(),
  continue: vi.fn(),
  transition: vi.fn(),
  binding: vi.fn(),
}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: { $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn({}) },
}));
vi.mock("./claim", () => ({ claimMonitorJob: f.claim }));
vi.mock("./repository", () => ({
  loadMonitorJob: f.load,
  assertMonitorClaim: f.assert,
  transitionMonitorJob: f.transition,
}));
vi.mock("./binding", () => ({ monitorWorkerBinding: f.binding }));
vi.mock("./continuation", () => ({ continueMonitorRun: f.continue }));
vi.mock("@/lib/local-monitoring-store/access", () => ({ localProjectScope: f.scope }));
vi.mock("@/lib/local-monitor-launch/snapshot", () => ({
  currentMonitorLaunchSnapshot: f.snapshot,
}));
vi.mock("@/lib/local-monitoring-host/manual-driver", () => ({
  resolveManualLocalDriver: f.factory,
}));
vi.mock("@/lib/local-monitoring-store/prepare-run", () => ({
  prepareLocalMeasurementRun: f.prepare,
}));
vi.mock("@/lib/local-monitor-launch/execute", () => ({ executePreparedMonitorRun: f.execute }));
const job = {
  id: "job",
  actorId: "actor",
  projectId: "project",
  runId: null,
  state: "running",
  connectionStamp: "stamp",
  expiresAt: new Date("2999-01-01"),
  pollIntervalMs: 60000,
  command: {
    projectId: "public-project",
    monitorId: "monitor",
    connectionId: "connection",
    targetIds: ["target"],
    quote: {},
    idempotencyKey: "key",
  },
};
beforeEach(() => {
  vi.resetAllMocks();
  f.claim.mockResolvedValue({ id: "job", token: "token", generation: 1 });
  f.load.mockResolvedValue(job);
  f.assert.mockResolvedValue(job);
  f.scope.mockResolvedValue({ actor: { id: "actor" }, project: { id: "project" } });
  f.snapshot.mockResolvedValue({ connectionStamp: "stamp", definition: {} });
  f.factory.mockResolvedValue({ kind: "ready", driver: { ports: {}, bindPreparedItem: vi.fn() } });
  f.prepare.mockResolvedValue({ id: "run", fresh: true, submitters: [] });
  f.continue.mockResolvedValue({ state: "pending", nextPollMs: 60000 });
});
describe("worker owns Local first-send and continuation", () => {
  it("admits and invokes fresh in-process permits only inside the worker", async () => {
    await executeMonitorJob("job", prisma);
    expect(f.prepare).toHaveBeenCalledTimes(1);
    expect(f.execute).toHaveBeenCalledTimes(1);
    expect(f.continue).toHaveBeenCalledTimes(1);
    expect(f.execute.mock.invocationCallOrder[0]).toBeLessThan(
      f.continue.mock.invocationCallOrder[0],
    );
  });
  it("never reconstructs submitters after an admitted run survives a restart", async () => {
    f.load.mockResolvedValue({ ...job, runId: "original-run" });
    f.assert.mockResolvedValue({ ...job, runId: "original-run" });
    await executeMonitorJob("job", prisma);
    expect(f.factory).not.toHaveBeenCalled();
    expect(f.prepare).not.toHaveBeenCalled();
    expect(f.execute).not.toHaveBeenCalled();
    expect(f.continue).toHaveBeenCalledTimes(1);
  });
  it("does not reserve or send after the original consent expires in the queue", async () => {
    f.assert.mockResolvedValue({ ...job, expiresAt: new Date(0) });
    expect(await executeMonitorJob("job", prisma)).toEqual({ state: "blocked", nextPollMs: null });
    expect(f.factory).not.toHaveBeenCalled();
    expect(f.prepare).not.toHaveBeenCalled();
    expect(f.execute).not.toHaveBeenCalled();
    expect(f.transition).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      "blocked",
      "expired",
      expect.any(Date),
    );
  });
  it.each(["complete", "blocked"] as const)(
    "keeps %s terminal job replay free of provider work and another poll",
    async (state) => {
      f.claim.mockResolvedValue(null);
      f.load.mockResolvedValue({ ...job, runId: "original-run", state });
      expect(await executeMonitorJob("job", prisma)).toEqual({ state, nextPollMs: null });
      expect(f.factory).not.toHaveBeenCalled();
      expect(f.prepare).not.toHaveBeenCalled();
      expect(f.execute).not.toHaveBeenCalled();
      expect(f.continue).not.toHaveBeenCalled();
    },
  );
  it("does no provider work while another worker owns the lease", async () => {
    f.claim.mockResolvedValue(null);
    await executeMonitorJob("job", prisma);
    expect(f.scope).not.toHaveBeenCalled();
    expect(f.factory).not.toHaveBeenCalled();
    expect(f.prepare).not.toHaveBeenCalled();
  });
});
