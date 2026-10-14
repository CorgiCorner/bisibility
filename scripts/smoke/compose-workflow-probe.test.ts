import { readFileSync } from "node:fs";
import { compileFunction, runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

const source = readFileSync("scripts/smoke/compose-workflow-probe.mjs", "utf8");
const workflowProbe = runInNewContext(source.replace("export const", "const") + "\nworkflowProbe;") as string;
const probe = compileFunction(
  `return (async () => { ${workflowProbe.replaceAll("await import(", "await moduleImport(")} })();`,
  ["moduleImport", "process", "console"],
);

function fixture() {
  const project = { id: "project1", publicId: "prj_fixture", ownerId: "owner1", domain: "example.com", isSample: false, measurementPolicyEpoch: 1n };
  const keyword = { id: "keyword1", publicId: "kw_fixture", projectId: project.id };
  const preview = vi.fn(async (_input: Record<string, unknown>) => ({ budget: { blocked: false }, executable: 1, previewToken: "signed-preview" }));
  const launch = vi.fn(async (_input: Record<string, unknown>) => ({ publicId: "rcr_fixture", targetCount: 1 }));
  const run = { id: "run1", orchestrationWorkflowId: "rank-check-run-rcr_fixture", items: [{ id: "item1", keywordId: keyword.id }] };
  const rankCheck = { id: "check1", status: "completed", runId: run.id, definitionExecutionToken: "retained-token", definitionExecutionPrincipal: { runId: run.id, runItemId: "item1", actorId: "owner1" } };
  const finalRun = { ...run, status: "completed", outcome: "succeeded", targetCount: 1, completedCount: 1,
    items: [{ ...run.items[0], rankCheckId: "check1", status: "completed" }] };
  const readRun = vi.fn().mockResolvedValueOnce(run).mockImplementation(async () => finalRun);
  const db = {
    keyword: { findFirst: vi.fn(async () => keyword) },
    project: { findUniqueOrThrow: vi.fn(async () => project) },
    providerConnection: { findFirst: vi.fn(async () => ({ id: "connection1" })), update: vi.fn(async () => ({})) },
    providerConnectionRate: { upsert: vi.fn(async () => ({})) },
    rankCheckRun: { findUniqueOrThrow: readRun },
    rankCheck: { findUnique: vi.fn(async () => rankCheck) },
    $disconnect: vi.fn(async () => undefined),
  };
  const result = vi.fn(async () => ({ rankCheckId: "check1" }));
  const getHandle = vi.fn((_workflowId: string) => ({ result }));
  const start = vi.fn(async (_input: unknown) => ({ alreadyExists: false }));
  const claim = vi.fn(async (input: { runId: string; workflowId: string; startRun: typeof start }, client: unknown) => {
    expect(client).toBe(db);
    await input.startRun({ runId: input.runId, workflowId: input.workflowId });
    return { claimed: true, launched: true };
  });
  const close = vi.fn(async () => undefined);
  const closeRedis = vi.fn(async () => undefined);
  const workflowExists = vi.fn(async () => true);
  const modules: Record<string, unknown> = {
    "file:///app/lib/db/prisma.ts": { prisma: db },
    "file:///app/lib/redis/redis.ts": { closeRedisClient: closeRedis },
    "file:///app/lib/providers/crypto.ts": { encryptSecret: vi.fn(() => "encrypted-fixture") },
    "file:///app/lib/measurement-definitions/host-policy-configuration.ts": { configureHostDefinitionPolicy: vi.fn(async () => ({})) },
    "file:///app/lib/rank-check/runs/preview.ts": { previewRankCheckRun: preview },
    "file:///app/lib/rank-check/runs/launch.ts": { launchRankCheckRun: launch },
    "file:///app/lib/rank-check/planner/queued-launch.ts": { claimQueuedRankCheckRun: claim },
    "file:///app/lib/temporal/rank-check-run-workflow-gateway.ts": { rankCheckRunWorkflowGateway: { startRun: start, workflowExists } },
    "file:///app/lib/temporal/client.ts": {
      closeTemporalClient: close, getTemporalClient: async () => ({ workflow: { getHandle } }),
      runItemRankCheckWorkflowId: (keywordId: string, itemId: string) => `${keywordId}-run-${itemId}`,
    },
  };
  const log = vi.fn<(value: string) => void>();
  const error = vi.fn<(value: string) => void>();
  const execute = (environment = { BISIBILITY_FAKE_PROVIDER: "1", DEPLOYMENT_ENV: "test" }) =>
    probe(async (path: string) => {
      if (!(path in modules)) throw new Error(`Unexpected runtime import: ${path}`);
      return modules[path];
    }, { env: environment }, { log, error }) as Promise<void>;
  return { execute, db, project, keyword, preview, launch, run, finalRun, claim, start, close, getHandle, workflowExists, log, closeRedis, error };
}

describe("Compose retained run workflow probe", () => {
  it("previews and launches a real owned run before awaiting parent and child completion", async () => {
    const f = fixture();
    await f.execute();
    expect(f.preview).toHaveBeenCalledWith({
      project: f.project, providerId: "dataforseo", origin: { source: "app" },
      spec: { kind: "single", keywordId: "kw_fixture", v: 1 }, trigger: "manual",
    });
    expect(f.launch).toHaveBeenCalledWith({
      ...f.preview.mock.calls[0][0], actorId: "owner1", previewToken: "signed-preview",
    });
    expect(f.preview.mock.invocationCallOrder[0]).toBeLessThan(f.launch.mock.invocationCallOrder[0]);
    expect(f.claim).toHaveBeenCalledWith(expect.objectContaining({ runId: "run1", workflowId: "rank-check-run-rcr_fixture", startRun: f.start }), f.db);
    expect(f.start).toHaveBeenCalledWith({ runId: "run1", workflowId: "rank-check-run-rcr_fixture" });
    expect(f.getHandle.mock.calls).toEqual([["rank-check-run-rcr_fixture"], ["keyword1-run-item1"]]);
    expect(JSON.parse(f.log.mock.calls[0][0])).toMatchObject({ status: "completed", runId: "run1" });
    expect(f.closeRedis).toHaveBeenCalledOnce();
    expect(f.close).toHaveBeenCalledOnce();
    expect(f.db.$disconnect).toHaveBeenCalledOnce();
  });

  it("rejects non-test environments before fixture writes or launch", async () => {
    const f = fixture();
    await expect(f.execute({ BISIBILITY_FAKE_PROVIDER: "1", DEPLOYMENT_ENV: "production" })).rejects.toThrow("isolated fake-provider");
    expect(f.db.keyword.findFirst).not.toHaveBeenCalled();
    expect(f.db.providerConnection.update).not.toHaveBeenCalled();
    expect(f.launch).not.toHaveBeenCalled();
    expect(f.closeRedis).toHaveBeenCalledOnce();
    expect(f.close).toHaveBeenCalledOnce();
    expect(f.db.$disconnect).toHaveBeenCalledOnce();
  });

  it("does not launch or start a workflow when preview admission is blocked", async () => {
    const f = fixture();
    f.preview.mockResolvedValue({ budget: { blocked: true }, executable: 1, previewToken: "signed-preview" });
    await expect(f.execute()).rejects.toThrow("preview was not admitted");
    expect(f.launch).not.toHaveBeenCalled();
    expect(f.start).not.toHaveBeenCalled();
    expect(f.log).not.toHaveBeenCalled();
  });

  it("refuses a run that did not retain its selected keyword", async () => {
    const f = fixture();
    f.run.items[0].keywordId = "other-keyword";
    await expect(f.execute()).rejects.toThrow("retain its selected keyword");
    expect(f.start).not.toHaveBeenCalled();
    expect(f.log).not.toHaveBeenCalled();
  });

  it("rejects completed checks without retained worker authority or matching run", async () => {
    for (const field of ["definitionExecutionToken", "definitionExecutionPrincipal", "runId"] as const) {
      const f = fixture();
      f.db.rankCheck.findUnique.mockResolvedValue({
        ...(await f.db.rankCheck.findUnique()), [field]: field === "runId" ? "other-run" : null,
      } as Awaited<ReturnType<typeof f.db.rankCheck.findUnique>>);
      await expect(f.execute()).rejects.toThrow("persist a completed result");
      expect(f.log).not.toHaveBeenCalled();
      expect(f.db.$disconnect).toHaveBeenCalledOnce();
    }
  });
  it("accepts an already-started intent owner without launching a different parent", async () => {
    const f = fixture();
    f.claim.mockImplementation(async () => ({ claimed: false, launched: false }));
    await f.execute();
    expect(f.start).not.toHaveBeenCalled();
    expect(f.getHandle.mock.calls).toEqual([["rank-check-run-rcr_fixture"], ["keyword1-run-item1"]]);
    expect(f.log).toHaveBeenCalledOnce();
  });

  it.each(["queued", "running", "cancelling", "cancelled"])("rejects a final run status of %s", async (status) => {
    const f = fixture();
    f.finalRun.status = status;
    await expect(f.execute()).rejects.toThrow("finalize its completed owned target");
    expect(f.log).not.toHaveBeenCalled();
  });

  it.each(["queued", "running", "failed", "deferred", "cancelled", "skipped", "blocked"])("rejects a final item status of %s", async (status) => {
    const f = fixture();
    f.finalRun.items[0].status = status;
    await expect(f.execute()).rejects.toThrow("finalize its completed owned target");
    expect(f.log).not.toHaveBeenCalled();
  });

  it("rejects changed target counts, outcomes and retained item identity", async () => {
    for (const change of [
      (run: ReturnType<typeof fixture>["finalRun"]) => { run.targetCount = 2; },
      (run: ReturnType<typeof fixture>["finalRun"]) => { run.completedCount = 0; },
      (run: ReturnType<typeof fixture>["finalRun"]) => { run.outcome = "partial"; },
      (run: ReturnType<typeof fixture>["finalRun"]) => { run.items[0].rankCheckId = "other-check"; },
      (run: ReturnType<typeof fixture>["finalRun"]) => { run.items[0].id = "other-item"; },
    ]) {
      const f = fixture();
      change(f.finalRun);
      await expect(f.execute()).rejects.toThrow("finalize its completed owned target");
      expect(f.log).not.toHaveBeenCalled();
    }
  });
  it("waits for the existing intent owner to start without a second dispatch", async () => {
    const f = fixture();
    f.claim.mockImplementation(async () => ({ claimed: false, launched: false }));
    f.workflowExists.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    await f.execute();
    expect(f.workflowExists).toHaveBeenCalledTimes(2);
    expect(f.claim).toHaveBeenCalledOnce();
    expect(f.start).not.toHaveBeenCalled();
    expect(f.log).toHaveBeenCalledOnce();
  });

  it("bounds missing-workflow waiting without restarting the retained intent", async () => {
    const f = fixture();
    f.claim.mockImplementation(async () => ({ claimed: false, launched: false }));
    f.workflowExists.mockResolvedValue(false);
    const clock = vi.spyOn(Date, "now").mockReturnValueOnce(0).mockReturnValue(30_000);
    try {
      await expect(f.execute()).rejects.toThrow("before the deadline");
      expect(f.workflowExists).toHaveBeenCalledOnce();
      expect(f.start).not.toHaveBeenCalled();
      expect(f.getHandle).not.toHaveBeenCalled();
    } finally { clock.mockRestore(); }
  });

  it("propagates transport failures without another claim, start or provider launch", async () => {
    const f = fixture();
    f.workflowExists.mockRejectedValue(new Error("Temporal transport unavailable"));
    await expect(f.execute()).rejects.toThrow("Temporal transport unavailable");
    expect(f.workflowExists).toHaveBeenCalledOnce();
    expect(f.claim).toHaveBeenCalledOnce();
    expect(f.launch).toHaveBeenCalledOnce();
    expect(f.getHandle).not.toHaveBeenCalled();
    expect(f.log).not.toHaveBeenCalled();
  });

  it("closes all clients even when another teardown fails", async () => {
    const f = fixture();
    f.closeRedis.mockRejectedValue(new Error("Redis teardown failure"));
    await expect(f.execute()).rejects.toThrow("Redis teardown failure");
    expect(f.close).toHaveBeenCalledOnce();
    expect(f.db.$disconnect).toHaveBeenCalledOnce();
  });

  it("retains captured phase and worker output when Docker times out", () => {
    const harness = readFileSync("scripts/smoke/compose-contract.mjs", "utf8");
    const start = harness.indexOf("function docker(");
    const end = harness.indexOf("\nfunction sleep", start);
    const spawn = vi.fn(() => ({ error: new Error("spawnSync docker ETIMEDOUT"), status: null,
      stdout: '{"status":"completed"}', stderr: "[compose-probe] clients-closed" }));
    const docker = compileFunction(`${harness.slice(start, end)}; return docker;`, ["spawnSync", "env"])(spawn, {}) as (args: string[], options: { capture: boolean; timeoutMs: number }) => void;
    expect(() => docker(["exec", "fixture-worker"], { capture: true, timeoutMs: 120_000 }))
      .toThrow(/ETIMEDOUT[\s\S]*"status":"completed"[\s\S]*clients-closed/);
  });

  it("bounds the actual Docker probe subprocess and turns timeout into failure", () => {
    const harness = readFileSync("scripts/smoke/compose-contract.mjs", "utf8");
    const start = harness.indexOf("function docker(");
    const end = harness.indexOf("\nfunction sleep", start);
    const spawn = vi.fn(() => ({ error: new Error("spawnSync docker ETIMEDOUT"), status: null }));
    const docker = compileFunction(`${harness.slice(start, end)}; return docker;`, ["spawnSync", "env"])(spawn, {}) as (args: string[], options: { capture: boolean; timeoutMs: number }) => void;
    expect(() => docker(["exec", "fixture-worker"], { capture: true, timeoutMs: 120_000 })).toThrow("ETIMEDOUT");
    expect(spawn).toHaveBeenCalledWith("docker", ["exec", "fixture-worker"], expect.objectContaining({ timeout: 120_000 }));
    expect(harness).toContain("{ capture: true, timeoutMs: 120_000 }");
  });

});
