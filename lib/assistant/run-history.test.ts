import { beforeEach, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({ conversation: vi.fn(), calls: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({ prisma: { assistantToolCall: { findMany: mocks.calls } } }));
vi.mock("./conversations", () => ({ getAssistantConversation: mocks.conversation }));

import { assistantRunHistory } from "./run-history";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.conversation.mockResolvedValue({
    messages: [{ role: "user", parts: [{ type: "text", text: "hi" }] }],
  });
});

const call = (id: string, step: number | null, providerReasoning: unknown = null) => ({
  toolName: "list_keywords",
  status: "completed",
  args: { limit: 1 },
  result: { providerCallId: id, payload: { id } },
  step,
  providerReasoning,
});

test("a resumed run replays each step as one turn led by its signed reasoning", async () => {
  const signed = [
    { type: "reasoning", text: "", providerOptions: { anthropic: { signature: "s" } } },
  ];
  mocks.calls.mockResolvedValue([
    call("a", 1, signed),
    call("b", 1),
    call("c", null),
    call("d", 2, [{ type: "reasoning", text: "", providerOptions: { other: {} } }]),
  ]);
  const { history } = await assistantRunHistory("conversation", "run", "user");
  expect(history.map((item) => `${item.type}:${"id" in item ? item.id : ""}`)).toEqual([
    "user:",
    "reasoning:",
    "tool_call:a",
    "tool_call:b",
    "tool_result:a",
    "tool_result:b",
    "tool_call:c",
    "tool_result:c",
    "tool_call:d",
    "tool_result:d",
  ]);
  expect(history[1]).toEqual(signed[0]);
});
