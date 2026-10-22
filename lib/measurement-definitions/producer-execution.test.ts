import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  assignedDefinitionSourceFixture,
  definitionBindingFixture,
  definitionHeadFixture,
  definitionSourceFixture,
} from "./fixtures";
import type {
  DefinitionExecutionStage,
  DefinitionOwner,
  DefinitionProducerPorts,
  DefinitionTransaction,
  VerifiedDefinitionExecution,
} from "./model";
import { assertDefinitionAtDispatch, captureDefinitionBeforeIo } from "./producer";

vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({
  actor: vi.fn(),
  installed: vi.fn(),
  lock: vi.fn(),
  binding: vi.fn(),
  head: vi.fn(),
  source: vi.fn(),
}));
vi.mock("./access", () => ({ assertDefinitionActor: mocks.actor }));
vi.mock("./storage", () => ({
  definitionAuthorityInstalled: mocks.installed,
  lockDefinitionSource: mocks.lock,
  readDefinitionBinding: mocks.binding,
  readDefinitionHead: mocks.head,
  readDefinitionSource: mocks.source,
}));
function setup(
  execution: VerifiedDefinitionExecution = { kind: "user", actorId: "actual-user" },
  source = definitionSourceFixture(),
) {
  const binding = definitionBindingFixture(source);
  const execute = vi.fn(async () => 1);
  const key = vi.fn(async () => ({ scopes: ["write"], revokedAt: null, expiresAt: null }));
  const tx = {
    $queryRaw: vi.fn(async () => []),
    apiKey: { findFirst: key },
    $executeRaw: execute,
    project: { findUnique: vi.fn(async () => ({ writeMode: "active", isSample: false })) },
  } as unknown as DefinitionTransaction;
  mocks.installed.mockResolvedValue(true);
  mocks.lock.mockResolvedValue(undefined);
  mocks.source.mockResolvedValue(source);
  mocks.head.mockResolvedValue(definitionHeadFixture(source));
  mocks.binding.mockResolvedValue(binding);
  mocks.actor.mockResolvedValue(undefined);
  const verify = vi.fn(
    async (
      _tx: DefinitionTransaction,
      _owner: DefinitionOwner,
      _input: Readonly<{ projectId: string; keywordId: string; providerId: string }>,
      _stage: DefinitionExecutionStage,
    ) => execution,
  );
  const audit = vi.fn(async () => undefined);
  const host: DefinitionProducerPorts = {
    assertOwnExecution: verify,
    assertImplementedAdapter: vi.fn(async () => undefined),
    recordMutation: audit,
  };
  const input = {
    projectId: binding.projectId,
    keywordId: binding.keywordId,
    providerId: binding.request.providerId,
    owner: binding.owner,
  };
  return { binding, source, tx, key, execute, host, verify, audit, input };
}
function scheduler(): Extract<VerifiedDefinitionExecution, { kind: "scheduler" }> {
  return {
    kind: "scheduler",
    actorId: null,
    runId: "owned-run",
    runItemId: "owned-item",
    scheduleId: "synthetic-schedule",
    scheduleEpoch: "0",
  };
}
beforeEach(() => vi.resetAllMocks());
describe("trusted definition execution union", () => {
  it("refuses a tampered v2 Top20 early-stop request instead of silently changing its policy", async () => {
    const source = definitionSourceFixture();
    source.policy.defaults!.serpDepth = 20;
    const f = setup({ kind: "user", actorId: "actual-user" }, source);
    const retained = { ...f.binding, request: { ...f.binding.request, stopOnMatch: true } };
    mocks.binding.mockResolvedValue(retained);
    await expect(captureDefinitionBeforeIo(f.tx, f.input, f.host)).rejects.toMatchObject({
      code: "measurement_definition_conflict",
    });
    expect(retained.request.stopOnMatch).toBe(true);
    expect(f.execute).not.toHaveBeenCalled();
    expect(f.audit).not.toHaveBeenCalled();
  });
  it("resumes an exact DB-retained legacy Top20 binding with its original bytes at capture and dispatch", async () => {
    const source = definitionSourceFixture();
    if (!source.policy.defaults) throw new Error("Missing fixture defaults");
    source.policy.defaults.serpDepth = 20;
    const f = setup({ kind: "user", actorId: "actual-user" }, source);
    const { compilerVersion: _version, ...request } = f.binding
      .request as typeof f.binding.request & { compilerVersion?: 2 };
    const retained = { ...f.binding, request: { ...request, stopOnMatch: true } };
    mocks.binding.mockResolvedValue(retained);
    await expect(captureDefinitionBeforeIo(f.tx, f.input, f.host)).resolves.toBe(retained);
    await expect(assertDefinitionAtDispatch(f.tx, retained, f.host)).resolves.toEqual(
      retained.request,
    );
    expect(retained.request).not.toHaveProperty("compilerVersion");
    expect(retained.request.stopOnMatch).toBe(true);
    expect(f.execute).not.toHaveBeenCalled();
    expect(f.audit).not.toHaveBeenCalled();
  });
  it("renews user authority at both capture and dispatch", async () => {
    const f = setup();
    await captureDefinitionBeforeIo(f.tx, f.input, f.host);
    await assertDefinitionAtDispatch(f.tx, f.binding, f.host);
    expect(mocks.actor).toHaveBeenNthCalledWith(
      1,
      f.tx,
      "actual-user",
      f.input.projectId,
      "update",
    );
    expect(mocks.actor).toHaveBeenNthCalledWith(
      2,
      f.tx,
      "actual-user",
      f.input.projectId,
      "update",
    );
    expect(f.verify.mock.calls.map((call) => call[3])).toEqual(["capture", "dispatch"]);
  });
  it("renews the same project credential on capture and dispatch, retaining null audit actor", async () => {
    const f = setup({
      kind: "project_credential",
      actorId: null,
      projectId: "synthetic-project",
      runId: "original-run",
      runItemId: "original-item",
      credentialKind: "project_key",
      credentialId: "original-key",
    });
    mocks.binding.mockResolvedValueOnce(null).mockResolvedValueOnce(f.binding);
    await captureDefinitionBeforeIo(f.tx, f.input, f.host);
    await assertDefinitionAtDispatch(f.tx, f.binding, f.host);
    expect(f.key).toHaveBeenCalledTimes(2);
    expect(f.key).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "original-key", projectId: f.input.projectId } }),
    );
    expect(mocks.actor).not.toHaveBeenCalled();
    expect(f.audit).toHaveBeenCalledWith(f.tx, expect.objectContaining({ actorId: null }));
    f.key.mockResolvedValueOnce({ scopes: ["read"], revokedAt: null, expiresAt: null });
    await expect(assertDefinitionAtDispatch(f.tx, f.binding, f.host)).rejects.toMatchObject({
      code: "measurement_definition_unavailable",
    });
  });
  it("does not select scheduler rights from JSON kind/actor/role/stage", async () => {
    const f = setup();
    const payload = {
      ...f.input,
      kind: "scheduler",
      actorId: null,
      role: "owner",
      stage: "dispatch",
      owner: { ...f.input.owner, kind: "scheduler", actorId: null },
    };
    await captureDefinitionBeforeIo(f.tx, payload, f.host);
    expect(mocks.actor).toHaveBeenCalledOnce();
    expect(f.verify).toHaveBeenCalledWith(
      f.tx,
      f.input.owner,
      {
        projectId: f.input.projectId,
        keywordId: f.input.keywordId,
        providerId: f.input.providerId,
      },
      "capture",
    );
  });
  it("accepts only the trusted scheduler result with null audit actor, without owner impersonation", async () => {
    const f = setup(scheduler(), assignedDefinitionSourceFixture());
    mocks.binding.mockResolvedValueOnce(null).mockResolvedValueOnce(f.binding);
    await captureDefinitionBeforeIo(f.tx, f.input, f.host);
    await assertDefinitionAtDispatch(f.tx, f.binding, f.host);
    expect(mocks.actor).not.toHaveBeenCalled();
    expect(f.audit).toHaveBeenCalledWith(
      f.tx,
      expect.objectContaining({ actorId: null, operation: "capture" }),
    );
  });
  it("rejects a fabricated user actor on scheduler output and the obsolete untagged port result", async () => {
    for (const output of [{ ...scheduler(), actorId: "owner" }, { actorId: "actual-user" }]) {
      const f = setup(output as unknown as VerifiedDefinitionExecution);
      await expect(captureDefinitionBeforeIo(f.tx, f.input, f.host)).rejects.toMatchObject({
        code: "measurement_definition_unavailable",
      });
      expect(f.execute).not.toHaveBeenCalled();
      expect(mocks.actor).not.toHaveBeenCalled();
    }
  });
  it("rejects legacy scheduler authority without named membership despite daily defaults", async () => {
    const source = definitionSourceFixture();
    source.policy.defaults!.frequency = "daily";
    source.policy.keywordSchedule = { ...source.policy.defaults!, id: "legacy" };
    const f = setup({ ...scheduler(), scheduleId: null, scheduleEpoch: null }, source);
    mocks.binding.mockResolvedValueOnce(null);
    await expect(captureDefinitionBeforeIo(f.tx, f.input, f.host)).rejects.toMatchObject({
      code: "measurement_definition_conflict",
    });
    expect(f.execute).not.toHaveBeenCalled();
  });
  it("does not use system scope when current intent is manual, disabled or from a different epoch", async () => {
    for (const state of ["manual", "disabled", "epoch"] as const) {
      const source = assignedDefinitionSourceFixture();
      if (state === "manual") source.policy.checkSchedule!.frequency = "manual";
      if (state === "disabled") source.policy.checkSchedule!.enabled = false;
      if (state === "epoch") source.epochs.checkSchedule = "1";
      const f = setup(scheduler(), source);
      mocks.binding.mockResolvedValueOnce(null);
      await expect(captureDefinitionBeforeIo(f.tx, f.input, f.host)).rejects.toMatchObject({
        code: "measurement_definition_conflict",
      });
      expect(f.execute).not.toHaveBeenCalled();
      await expect(assertDefinitionAtDispatch(f.tx, f.binding, f.host)).rejects.toMatchObject({
        code: "measurement_definition_conflict",
      });
    }
  });
  it("propagates revoked current user membership and denied server fence before writes/send", async () => {
    const f = setup();
    mocks.actor.mockRejectedValueOnce(new Error("Revoked membership"));
    await expect(captureDefinitionBeforeIo(f.tx, f.input, f.host)).rejects.toThrow(
      "Revoked membership",
    );
    expect(f.execute).not.toHaveBeenCalled();
    f.verify.mockRejectedValueOnce(new Error("Lost own fence"));
    await expect(assertDefinitionAtDispatch(f.tx, f.binding, f.host)).rejects.toThrow(
      "Lost own fence",
    );
    expect(f.execute).not.toHaveBeenCalled();
  });
});
