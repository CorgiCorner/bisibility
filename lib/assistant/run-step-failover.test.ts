import { beforeEach, expect, test, vi } from "vitest";
import type { AssistantAccountingBinding } from "./accounting-scope";
import type { ProviderEvent } from "./provider-types";

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  admit: vi.fn(),
  dispatch: vi.fn(),
  provider: vi.fn(),
  close: vi.fn(),
  stop: vi.fn(),
  key: vi.fn(),
  health: vi.fn(),
  attemptUpdate: vi.fn(),
  settle: vi.fn(),
  runRead: vi.fn(),
  runUpdate: vi.fn(),
  notify: vi.fn(),
  unknown: vi.fn(),
}));
vi.mock("@/lib/ops/notify", () => ({ notifyOps: mocks.notify }));
vi.mock("./accounting-recovery", () => ({ closeReceiptlessAssistantAttempt: mocks.close }));
vi.mock("./stop-settlement", () => ({ chargeStoppedStep: mocks.stop }));
vi.mock("@/lib/db/prisma", () => ({ prisma: { $transaction: mocks.transaction } }));
vi.mock("@/lib/providers/crypto", () => ({ decryptSecret: () => "unused" }));
vi.mock("./accounting-admission", () => ({
  admitAssistantAttempt: mocks.admit,
  dispatchBoundAssistantAttempt: mocks.dispatch,
}));
vi.mock("./accounting-operation", () => ({
  releaseAssistantAttempt: vi.fn(),
  markAssistantAttemptUnknown: mocks.unknown,
  settleAssistantAttempt: vi.fn(),
}));
vi.mock("./funding-extension", () => ({
  hostedAssistantProviderKey: mocks.key,
  recordHostedAssistantKeyOutcome: mocks.health,
  releaseAssistantCreditAttempt: vi.fn(),
  settleAssistantCreditAttempt: mocks.settle,
}));
vi.mock("./provider", () => ({ streamAssistantProvider: mocks.provider }));

import { runAssistantStep } from "./run-step";

const binding: AssistantAccountingBinding = {
  namespace: "assistant",
  ownerId: "owner",
  userId: "user",
  projectId: "project",
  runId: "run",
  operationId: "assistant:run:1",
  funding: "credits",
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
const input = (signal = new AbortController().signal) => ({
  binding,
  step: 1,
  body: { prompt: [], tools: [], maxOutputTokens: 1 },
  signal,
  timeoutMs: 1000,
  onText: () => {},
});
const usage = {
  inputTokens: 1,
  cachedInputTokens: 0,
  cacheWriteTokens: 0,
  outputTokens: 1,
  reasoningTokens: 0,
};
const keys = ["key-a", "key-b", "env"];
const stream = (...events: ProviderEvent[]) =>
  (async function* () {
    yield* events;
  })();
const refusedBy = (keyRejection: "invalid_key" | "quota_exhausted") =>
  stream({ type: "error", code: "provider_unavailable", rejected: true, keyRejection });
const answered = () =>
  stream({ type: "text-delta", text: "ok" }, { type: "usage", usage, requestId: "r" });

beforeEach(() => {
  vi.resetAllMocks();
  const tx = {
    assistantCredential: { findUnique: vi.fn() },
    assistantAttempt: { update: mocks.attemptUpdate },
    assistantRun: { findUniqueOrThrow: mocks.runRead, update: mocks.runUpdate },
  };
  mocks.transaction.mockImplementation(async (fn) => fn(tx));
  mocks.admit.mockImplementation(async (_tx, attempt: AssistantAccountingBinding) => ({
    outcome: "reserved",
    replayed: false,
    operation: { operationId: attempt.operationId, version: 1 },
  }));
  mocks.dispatch.mockImplementation(async (_tx, _binding, operation) => ({
    operation,
    lease: { leaseId: "lease" },
  }));
  // The best untried key, as the resolver would answer with an exclusion list.
  mocks.key.mockImplementation(async (_provider, options: { exclude?: string[] } = {}) => {
    const keyId = keys.find((id) => !options.exclude?.includes(id));
    return keyId ? { keyId, apiKey: `secret-${keyId}` } : null;
  });
  mocks.runRead.mockResolvedValue({ costMicroUsd: null });
  mocks.health.mockResolvedValue(undefined);
  mocks.notify.mockResolvedValue(undefined);
});

test("a key refused before running moves to the next key as a new, separately admitted attempt", async () => {
  mocks.provider.mockReturnValueOnce(refusedBy("invalid_key")).mockReturnValueOnce(answered());
  const result = await runAssistantStep(input());
  expect(result).toMatchObject({ text: "ok", error: null, unknown: false });
  expect(result).not.toHaveProperty("keyRefusal");
  // The refused attempt closed at zero, and the retry was admitted again under its own id.
  expect(mocks.close).toHaveBeenCalledTimes(1);
  expect(mocks.close.mock.calls[0]?.[1]).toMatchObject({ outcome: "rejected" });
  expect(mocks.admit.mock.calls.map((call) => call[1].operationId)).toEqual([
    "assistant:run:1",
    "assistant:run:1:key1",
  ]);
  expect(mocks.admit.mock.calls[1]?.[1]).toMatchObject({ keyAttempt: 1 });
  expect(mocks.provider.mock.calls.map((call) => call[0].apiKey)).toEqual([
    "secret-key-a",
    "secret-key-b",
  ]);
  // Each attempt froze the key it was dispatched on.
  expect(mocks.attemptUpdate.mock.calls.map((call) => call[0])).toEqual([
    { where: { operationId: "assistant:run:1" }, data: { providerKeyId: "key-a" } },
    { where: { operationId: "assistant:run:1:key1" }, data: { providerKeyId: "key-b" } },
  ]);
  expect(mocks.health).toHaveBeenCalledWith("key-a", "invalid_key");
  expect(mocks.health).toHaveBeenCalledWith("key-b", "ok");
});

test("the environment key is the last fallback, and with no key left the refusal stands", async () => {
  mocks.provider
    .mockReturnValueOnce(refusedBy("quota_exhausted"))
    .mockReturnValueOnce(refusedBy("invalid_key"))
    .mockReturnValueOnce(refusedBy("invalid_key"));
  const result = await runAssistantStep(input());
  expect(mocks.provider.mock.calls.map((call) => call[0].apiKey)).toEqual([
    "secret-key-a",
    "secret-key-b",
    "secret-env",
  ]);
  expect(result).toMatchObject({ error: "provider_unavailable", unknown: false });
  expect(mocks.admit).toHaveBeenCalledTimes(3);
});

test.each<[string, ProviderEvent[]]>([
  ["a timeout", [{ type: "error", code: "timeout" }]],
  [
    "a server error before any response",
    [{ type: "error", code: "provider_unavailable", rejected: true, providerFailure: true }],
  ],
  ["a plain refusal", [{ type: "error", code: "provider_rate_limited", rejected: true }]],
  [
    "output before the error",
    [
      { type: "text-delta", text: "partial" },
      { type: "error", code: "provider_unavailable", rejected: true, keyRejection: "invalid_key" },
    ],
  ],
])("%s never moves to another key", async (_name, events) => {
  mocks.provider.mockReturnValueOnce(stream(...events));
  await runAssistantStep(input());
  expect(mocks.provider).toHaveBeenCalledTimes(1);
  expect(mocks.admit).toHaveBeenCalledTimes(1);
});

test("a team's own key never moves to a platform key", async () => {
  mocks.provider.mockReturnValueOnce(refusedBy("invalid_key"));
  const tx = {
    assistantCredential: {
      findUnique: async () => ({ encryptedSecret: "sealed", versionHash: "version" }),
    },
    assistantAttempt: { update: mocks.attemptUpdate },
  };
  mocks.transaction.mockImplementation(async (fn) => fn(tx));
  await runAssistantStep({
    ...input(),
    binding: { ...binding, funding: "byok", credentialId: "c", credentialVersion: "version" },
  });
  expect(mocks.provider).toHaveBeenCalledTimes(1);
  expect(mocks.key).not.toHaveBeenCalled();
  expect(mocks.attemptUpdate).not.toHaveBeenCalled();
});

test("a stop while the next key is chosen starts no further call", async () => {
  const controller = new AbortController();
  mocks.provider.mockImplementationOnce(() => {
    controller.abort();
    return refusedBy("invalid_key");
  });
  const result = await runAssistantStep(input(controller.signal));
  expect(result.error).toBe("cancelled");
  expect(mocks.provider).toHaveBeenCalledTimes(1);
  expect(mocks.admit).toHaveBeenCalledTimes(1);
});

test("a refusal by the kill switch or budget at the retry's admission ends the step there", async () => {
  mocks.provider.mockReturnValueOnce(refusedBy("invalid_key"));
  mocks.admit
    .mockImplementationOnce(async (_tx, attempt: AssistantAccountingBinding) => ({
      outcome: "reserved",
      replayed: false,
      operation: { operationId: attempt.operationId, version: 1 },
    }))
    .mockResolvedValueOnce({ outcome: "exceeded", exceeded: { budget: { scope: { kind: "x" } } } });
  const result = await runAssistantStep(input());
  expect(result.error).toBe("limit_exceeded");
  expect(mocks.provider).toHaveBeenCalledTimes(1);
});
