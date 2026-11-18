import { beforeEach, expect, test, vi } from "vitest";
import type { AssistantAccountingBinding } from "./accounting-scope";

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  admit: vi.fn(),
  dispatch: vi.fn(),
  release: vi.fn(),
  unknown: vi.fn(),
  settle: vi.fn(),
  provider: vi.fn(),
  credential: vi.fn(),
  runRead: vi.fn(),
  runUpdate: vi.fn(),
  close: vi.fn(),
  stop: vi.fn(),
  notify: vi.fn(),
}));
vi.mock("@/lib/ops/notify", () => ({ notifyOps: mocks.notify }));
vi.mock("./accounting-recovery", () => ({ closeReceiptlessAssistantAttempt: mocks.close }));
vi.mock("./stop-settlement", () => ({ chargeStoppedStep: mocks.stop }));
vi.mock("@/lib/db/prisma", () => ({ prisma: { $transaction: mocks.transaction } }));
vi.mock("@/lib/providers/crypto", () => ({ decryptSecret: () => "fixture-key" }));
vi.mock("./accounting-admission", () => ({
  admitAssistantAttempt: mocks.admit,
  dispatchBoundAssistantAttempt: mocks.dispatch,
}));
vi.mock("./accounting-operation", () => ({
  releaseAssistantAttempt: mocks.release,
  markAssistantAttemptUnknown: mocks.unknown,
  settleAssistantAttempt: mocks.settle,
}));
vi.mock("./funding-extension", () => ({ hostedAssistantProviderKey: () => null }));
vi.mock("./provider", () => ({ streamAssistantProvider: mocks.provider }));

import { runAssistantStep } from "./run-step";

const binding: AssistantAccountingBinding = {
  namespace: "assistant",
  ownerId: "owner",
  userId: "user",
  projectId: "project",
  runId: "run",
  operationId: "operation",
  funding: "byok",
  credentialId: "credential",
  credentialVersion: "version",
  promptBytes: 1,
  model: {
    id: "m",
    provider: "openai",
    providerModel: "fixture",
    label: "Test",
    toolUse: true,
    maxOutputTokens: 1,
    contextChars: 100,
    pricing: {
      version: "v",
      inputMicroUsdPerMTok: 1000000,
      cachedInputMicroUsdPerMTok: 1000000,
      cacheWriteMicroUsdPerMTok: 1000000,
      outputMicroUsdPerMTok: 1000000,
    },
  },
};
beforeEach(() => {
  vi.resetAllMocks();
  const tx = {
    assistantCredential: { findUnique: mocks.credential },
    assistantRun: { findUniqueOrThrow: mocks.runRead, update: mocks.runUpdate },
  };
  mocks.transaction.mockImplementation(async (fn) => fn(tx));
  mocks.admit.mockResolvedValue({
    outcome: "reserved",
    replayed: false,
    operation: { version: 1 },
  });
  mocks.dispatch.mockResolvedValue({ operation: { version: 2 }, lease: { leaseId: "lease" } });
  mocks.credential.mockResolvedValue({ encryptedSecret: "fixture", versionHash: "version" });
  mocks.runRead.mockResolvedValue({ costMicroUsd: null });
  mocks.runUpdate.mockResolvedValue({});
  mocks.notify.mockResolvedValue(undefined);
  mocks.close.mockResolvedValue(undefined);
  mocks.stop.mockResolvedValue(undefined);
});
const input = (signal: AbortSignal) => ({
  binding,
  step: 1,
  body: { prompt: [], tools: [], maxOutputTokens: 1 },
  signal,
  timeoutMs: 1000,
  onText: vi.fn(),
});
test("stop before dispatch releases the reservation without provider contact", async () => {
  const controller = new AbortController();
  controller.abort();
  expect(await runAssistantStep(input(controller.signal))).toMatchObject({
    error: "cancelled",
    unknown: false,
  });
  expect(mocks.release).toHaveBeenCalledOnce();
  expect(mocks.dispatch).not.toHaveBeenCalled();
  expect(mocks.provider).not.toHaveBeenCalled();
});
test("missing usage after dispatch retains an unknown liability", async () => {
  mocks.provider.mockImplementation(async function* () {
    yield { type: "text-delta", text: "partial" };
    yield { type: "error", code: "cancelled" };
  });
  const result = await runAssistantStep(input(new AbortController().signal));
  expect(result).toMatchObject({ text: "partial", error: "cancelled", unknown: true });
  expect(mocks.unknown).toHaveBeenCalledOnce();
  expect(mocks.release).not.toHaveBeenCalled();
  expect(mocks.close).not.toHaveBeenCalled();
  expect(mocks.notify).toHaveBeenCalledWith(
    expect.objectContaining({ kind: "assistant_attempt_unknown", severity: "warning" }),
  );
});
test("a certain provider rejection settles at zero instead of holding an unknown", async () => {
  mocks.provider.mockImplementation(async function* () {
    yield { type: "error", code: "provider_rate_limited", rejected: true };
  });
  const result = await runAssistantStep(input(new AbortController().signal));
  expect(result).toMatchObject({ error: "provider_rate_limited", unknown: false });
  expect(mocks.close).toHaveBeenCalledWith(expect.anything(), {
    operation: { version: 2 },
    lease: { leaseId: "lease" },
    outcome: "rejected",
    providerFailure: false,
  });
  expect(mocks.unknown).not.toHaveBeenCalled();
});
test("a provider failure before any response closes at zero, marked for the failure watch", async () => {
  mocks.provider.mockImplementation(async function* () {
    yield { type: "error", code: "provider_unavailable", rejected: true, providerFailure: true };
  });
  const result = await runAssistantStep(input(new AbortController().signal));
  expect(result).toMatchObject({ error: "provider_unavailable", unknown: false });
  expect(mocks.stop).not.toHaveBeenCalled();
  expect(mocks.close).toHaveBeenCalledWith(expect.anything(), {
    operation: { version: 2 },
    lease: { leaseId: "lease" },
    outcome: "rejected",
    providerFailure: true,
  });
});
test("a stop after dispatch is charged for what it streamed, never closed at zero", async () => {
  const controller = new AbortController();
  const evidence = {
    generationId: "gen-1",
    promptUsage: null,
    reasoningBytes: 0,
    reasoningSeen: false,
  };
  mocks.provider.mockImplementation(async function* () {
    yield { type: "text-delta", text: "partial" };
    controller.abort();
    yield { type: "stopped", evidence };
    yield { type: "error", code: "cancelled" };
  });
  const result = await runAssistantStep(input(controller.signal));
  expect(result).toMatchObject({ text: "partial", error: "cancelled", unknown: false });
  expect(mocks.stop).toHaveBeenCalledWith(
    binding,
    { operation: { version: 2 }, lease: { leaseId: "lease" } },
    // "partial": 7 letters, 3 tokens. The request JSON: 26 letters (11) and 18 other bytes.
    { text: "partial", textTokens: 3, promptTokens: 29, evidence },
  );
  expect(mocks.close).not.toHaveBeenCalled();
  expect(mocks.unknown).not.toHaveBeenCalled();
});
test("a provider error after a response is charged from its evidence, never left unknown", async () => {
  const evidence = {
    generationId: null,
    promptUsage: null,
    reasoningBytes: 0,
    reasoningSeen: false,
  };
  mocks.provider.mockImplementation(async function* () {
    yield { type: "text-delta", text: "partial" };
    yield { type: "stopped", evidence };
    yield { type: "error", code: "usage_unknown" };
  });
  const result = await runAssistantStep(input(new AbortController().signal));
  expect(result).toMatchObject({ text: "partial", error: "usage_unknown", unknown: false });
  expect(mocks.stop).toHaveBeenCalledWith(
    binding,
    expect.anything(),
    expect.objectContaining({ text: "partial", evidence }),
  );
  expect(mocks.unknown).not.toHaveBeenCalled();
  expect(mocks.notify).not.toHaveBeenCalled();
});
test("a stopped attempt whose own charge cannot be written is left to the sweep, not unknown", async () => {
  mocks.stop.mockRejectedValue(new Error("store down"));
  mocks.provider.mockImplementation(async function* () {
    yield { type: "error", code: "timeout" };
  });
  const result = await runAssistantStep(input(new AbortController().signal));
  expect(mocks.stop).toHaveBeenCalledOnce();
  expect(mocks.close).not.toHaveBeenCalled();
  expect(result).toMatchObject({ error: "timeout", unknown: true });
  // It stays dispatched: the abandoned sweep charges its reservation, the safety net.
  expect(mocks.unknown).not.toHaveBeenCalled();
  expect(mocks.notify).toHaveBeenCalledOnce();
  expect(mocks.notify).toHaveBeenCalledWith(
    expect.objectContaining({ kind: "assistant_attempt_unsettled" }),
  );
});
test("signed reasoning is returned for the next step", async () => {
  const providerOptions = { anthropic: { signature: "sig" } };
  mocks.provider.mockImplementation(async function* () {
    yield { type: "reasoning", text: "Plan.", providerOptions };
    yield { type: "tool-call", id: "c", name: "read", argumentsJson: "{}" };
    yield {
      type: "usage",
      usage: {
        inputTokens: 1,
        cachedInputTokens: 0,
        cacheWriteTokens: 0,
        outputTokens: 1,
        reasoningTokens: 0,
      },
      requestId: null,
    };
  });
  const result = await runAssistantStep(input(new AbortController().signal));
  expect(result.reasoning).toEqual([{ type: "reasoning", text: "Plan.", providerOptions }]);
});
test("measured usage settles once and store failures never call the provider", async () => {
  mocks.provider.mockImplementation(async function* () {
    yield {
      type: "usage",
      usage: {
        inputTokens: 1,
        cachedInputTokens: 0,
        cacheWriteTokens: 0,
        outputTokens: 1,
        reasoningTokens: 0,
      },
      requestId: "fixture",
    };
    yield { type: "finish", reason: "stop" };
  });
  const result = await runAssistantStep(input(new AbortController().signal));
  expect(result).toMatchObject({ cost: 2n, unknown: false });
  expect(mocks.settle).toHaveBeenCalledOnce();
  mocks.provider.mockClear();
  mocks.admit.mockRejectedValue(new Error("database unavailable"));
  await expect(runAssistantStep(input(new AbortController().signal))).rejects.toThrow(
    "database unavailable",
  );
  expect(mocks.provider).not.toHaveBeenCalled();
});
test("a measured settlement that cannot be written is left to the sweep, not unknown", async () => {
  mocks.settle.mockRejectedValue(new Error("store down"));
  mocks.provider.mockImplementation(async function* () {
    yield {
      type: "usage",
      usage: {
        inputTokens: 1,
        cachedInputTokens: 0,
        cacheWriteTokens: 0,
        outputTokens: 1,
        reasoningTokens: 0,
      },
      requestId: "fixture",
    };
    yield { type: "finish", reason: "stop" };
  });
  const result = await runAssistantStep(input(new AbortController().signal));
  expect(result).toMatchObject({ error: "accounting_unavailable", unknown: true });
  expect(mocks.unknown).not.toHaveBeenCalled();
  expect(mocks.notify).toHaveBeenCalledWith(
    expect.objectContaining({ kind: "assistant_attempt_unsettled" }),
  );
});
