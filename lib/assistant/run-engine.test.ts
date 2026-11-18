import { beforeEach, expect, test, vi } from "vitest";
import type { EngineInput, UnsequencedAssistantEvent } from "./run-engine";

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  claim: vi.fn(),
  spent: vi.fn(),
  messageUpdate: vi.fn(),
  toolCount: vi.fn(),
  runRead: vi.fn(),
  runUpdate: vi.fn(),
  conversationUpdate: vi.fn(),
  project: vi.fn(),
  history: vi.fn(),
  step: vi.fn(),
  tools: vi.fn(),
}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    $transaction: mocks.transaction,
    assistantRun: { updateMany: mocks.claim, findUnique: mocks.spent },
    assistantMessage: { update: mocks.messageUpdate },
  },
}));
vi.mock("./access", () => ({
  assistantProject: mocks.project,
  AssistantRequestError: class extends Error {
    code = "permission_denied";
  },
}));
vi.mock("./run-history", () => ({ assistantRunHistory: mocks.history }));
vi.mock("./run-step", () => ({ runAssistantStep: mocks.step }));
vi.mock("./tool-steps", () => ({ processAssistantToolCalls: mocks.tools }));
vi.mock("./views", () => ({
  assistantRunView: (run: { id: string; status: string }) => ({ id: run.id, status: run.status }),
  assistantMessageView: () => ({ id: "user-message" }),
}));

import { executeAssistantRun } from "./run-engine";

const now = new Date();
const run = {
  id: "run",
  conversationId: "conversation",
  projectId: "project",
  userId: "user",
  status: "pending",
  provider: "openai",
  modelId: "m",
  funding: "byok",
  credentialId: "credential",
  credentialVersion: "version",
  stepCount: 0,
  createdAt: now,
};
const model = {
  id: "m",
  provider: "openai",
  providerModel: "fixture",
  label: "Test",
  toolUse: true,
  maxOutputTokens: 100,
  contextChars: 100000,
  pricing: {
    version: "v",
    inputMicroUsdPerMTok: 1,
    cachedInputMicroUsdPerMTok: 1,
    cacheWriteMicroUsdPerMTok: 1,
    outputMicroUsdPerMTok: 1,
  },
};
function fixture() {
  const events: UnsequencedAssistantEvent[] = [];
  const input = {
    run,
    assistantMessage: { id: "answer", parts: [] },
    userMessage: null,
    project: { id: "project", publicId: "prj_real", ownerId: "owner", name: "Test", domain: null },
    model,
    principal: { kind: "native_session", userId: "user", sessionId: "session" },
    userText: "hello",
    retry: false,
    signal: new AbortController().signal,
    timedOut: () => false,
    emit: (event: UnsequencedAssistantEvent) => events.push(event),
  } as unknown as EngineInput;
  return { input, events };
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.project.mockResolvedValue({});
  mocks.history.mockResolvedValue({
    history: [{ type: "user", text: "hello" }],
    groups: [],
    callCount: 0,
  });
  mocks.claim.mockResolvedValue({ count: 1 });
  mocks.spent.mockResolvedValue({ outputTokens: 0 });
  mocks.messageUpdate.mockResolvedValue({});
  mocks.toolCount.mockResolvedValue(0);
  mocks.runRead.mockResolvedValue({ ...run, status: "streaming" });
  mocks.runUpdate.mockImplementation(async ({ data }) => ({ ...run, ...data }));
  mocks.conversationUpdate.mockResolvedValue({ count: 1 });
  mocks.transaction.mockImplementation(async (fn) =>
    fn({
      assistantRun: { findUniqueOrThrow: mocks.runRead, update: mocks.runUpdate },
      assistantMessage: { update: mocks.messageUpdate },
      assistantToolCall: { count: mocks.toolCount },
      assistantConversation: { updateMany: mocks.conversationUpdate },
    }),
  );
});
test("a read tool result leads to a second metered step and a completed run", async () => {
  const signed = {
    type: "reasoning",
    text: "",
    providerOptions: { anthropic: { signature: "s" } },
  };
  mocks.step
    .mockResolvedValueOnce({
      text: "first",
      reasoning: [signed],
      calls: [{ id: "tool", name: "list_keywords", argumentsJson: "{}" }],
      error: null,
      unknown: false,
    })
    .mockResolvedValueOnce({ text: "done", reasoning: [], calls: [], error: null, unknown: false });
  mocks.tools.mockResolvedValue({
    history: [
      { type: "tool_call", id: "tool", name: "list_keywords", argumentsJson: "{}" },
      { type: "tool_result", id: "tool", result: { items: [] } },
    ],
    groups: [],
    waiting: false,
  });
  const f = fixture();
  await executeAssistantRun(f.input);
  expect(mocks.step).toHaveBeenCalledTimes(2);
  expect(mocks.tools).toHaveBeenCalledOnce();
  expect(mocks.tools.mock.calls[0]?.[0]).toMatchObject({ turn: { step: 1, reasoning: [signed] } });
  // The second step replays the signed reasoning ahead of the first step's text and tool call.
  const replay = mocks.step.mock.calls[1]?.[0].body.prompt.at(-2);
  expect(replay).toMatchObject({ role: "assistant", content: [{ type: "reasoning" }, {}, {}] });
  expect(f.events.at(-1)).toMatchObject({ type: "run.finished", run: { status: "completed" } });
});
test("unknown provider usage ends the run without executing tools", async () => {
  mocks.step.mockResolvedValue({
    text: "partial",
    reasoning: [],
    calls: [{ id: "tool", name: "add_keywords", argumentsJson: "{}" }],
    error: "usage_unknown",
    unknown: true,
  });
  const f = fixture();
  await executeAssistantRun(f.input);
  expect(mocks.tools).not.toHaveBeenCalled();
  expect(f.events.at(-1)).toMatchObject({ type: "run.finished", run: { status: "unknown" } });
});
test("a user Stop with unmeasured usage stays retryable and keeps the cost uncertain", async () => {
  const stop = new AbortController();
  mocks.step.mockImplementation(async () => {
    stop.abort();
    return { text: "partial", calls: [], error: "cancelled", unknown: true };
  });
  const f = fixture();
  // The stop endpoint has already marked the run cancelled.
  mocks.runRead.mockResolvedValue({ ...run, status: "cancelled" });
  await executeAssistantRun({ ...f.input, signal: stop.signal });
  expect(f.events.at(-1)).toMatchObject({ type: "run.finished", run: { status: "cancelled" } });
  expect(mocks.runUpdate).toHaveBeenLastCalledWith(
    expect.objectContaining({
      data: expect.objectContaining({ status: "cancelled", costCertainty: "unknown" }),
    }),
  );
});

test("a dropped connection with unmeasured usage stays unknown, not a user cancellation", async () => {
  const drop = new AbortController();
  mocks.step.mockImplementation(async () => {
    drop.abort();
    return { text: "partial", calls: [], error: "cancelled", unknown: true };
  });
  const f = fixture();
  mocks.runRead.mockResolvedValue({ ...run, status: "streaming" });
  await executeAssistantRun({ ...f.input, signal: drop.signal });
  expect(f.events.at(-1)).toMatchObject({ type: "run.finished", run: { status: "unknown" } });
  expect(mocks.runUpdate).toHaveBeenLastCalledWith(
    expect.objectContaining({
      data: expect.objectContaining({ status: "unknown", costCertainty: "unknown" }),
    }),
  );
});

test("a refused run with no output is not a partial response", async () => {
  mocks.step.mockResolvedValue({
    text: "",
    reasoning: [],
    calls: [],
    error: "limit_exceeded",
    unknown: false,
  });
  const f = fixture();
  await executeAssistantRun(f.input);
  expect(mocks.messageUpdate).toHaveBeenLastCalledWith({
    where: { id: "answer" },
    data: { parts: [], partial: false },
  });
});

test("text that streamed and then stopped stays a partial response", async () => {
  const stop = new AbortController();
  mocks.step.mockImplementation(async (step: { onText: (delta: string) => void }) => {
    step.onText("partial");
    stop.abort();
    return { text: "partial", calls: [], error: "cancelled", unknown: false };
  });
  const f = fixture();
  mocks.runRead.mockResolvedValue({ ...run, status: "cancelled" });
  await executeAssistantRun({ ...f.input, signal: stop.signal });
  expect(mocks.messageUpdate).toHaveBeenLastCalledWith({
    where: { id: "answer" },
    data: { parts: [{ type: "text", text: "partial" }], partial: true },
  });
});

test("a tool call with no text still marks an unfinished run partial", async () => {
  mocks.toolCount.mockResolvedValue(1);
  mocks.step.mockResolvedValue({ text: "", calls: [], error: "timeout", unknown: false });
  const f = fixture();
  await executeAssistantRun(f.input);
  expect(mocks.messageUpdate).toHaveBeenLastCalledWith({
    where: { id: "answer" },
    data: { parts: [], partial: true },
  });
});
test("the run's output cap bounds the request and the step's reservation binding", async () => {
  mocks.step.mockResolvedValue({
    text: "ok",
    reasoning: [],
    calls: [],
    error: null,
    unknown: false,
  });
  const f = fixture();
  await executeAssistantRun({
    ...f.input,
    run: { ...f.input.run, maxOutputTokens: 40 },
  } as EngineInput);
  const step = mocks.step.mock.calls[0]?.[0];
  expect(step.body.maxOutputTokens).toBe(40);
  expect(step.binding.model.maxOutputTokens).toBe(40);
});

test("the output cap bounds the whole turn, not each model call", async () => {
  const call = [{ id: "tool", name: "list_keywords", argumentsJson: "{}" }];
  mocks.step.mockResolvedValue({
    text: "",
    reasoning: [],
    calls: call,
    error: null,
    unknown: false,
  });
  mocks.tools.mockImplementation(async () => ({ history: [], groups: [], waiting: false }));
  // Settled output after each step: 25, then 40 of the 40-token cap.
  mocks.spent
    .mockResolvedValueOnce({ outputTokens: 0 })
    .mockResolvedValueOnce({ outputTokens: 25 })
    .mockResolvedValueOnce({ outputTokens: 40 });
  const f = fixture();
  await executeAssistantRun({
    ...f.input,
    run: { ...f.input.run, maxOutputTokens: 40 },
  } as EngineInput);
  expect(mocks.step).toHaveBeenCalledTimes(2);
  expect(mocks.step.mock.calls[1]?.[0].body.maxOutputTokens).toBe(15);
  expect(mocks.step.mock.calls[1]?.[0].binding.model.maxOutputTokens).toBe(15);
  expect(f.events).toContainEqual(
    expect.objectContaining({
      type: "error",
      error: expect.objectContaining({ code: "limit_exceeded" }),
    }),
  );
});

test("the short-tier Haiku bound rejects UTF-8 prompt bytes before any paid step", async () => {
  mocks.history.mockResolvedValue({
    history: [{ type: "user", text: "界".repeat(22_000) }],
    groups: [],
    callCount: 0,
  });
  const f = fixture();
  await executeAssistantRun({
    ...f.input,
    run: { ...f.input.run, provider: "anthropic" },
    model: {
      ...f.input.model,
      provider: "anthropic",
      providerModel: "claude-haiku-5-5",
      contextChars: 64_000,
    },
  });
  expect(mocks.step).not.toHaveBeenCalled();
  expect(f.events.at(-1)).toMatchObject({ type: "run.finished", run: { status: "failed" } });
});
