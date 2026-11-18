import { beforeEach, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({ create: vi.fn(), updateMany: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({
  prisma: { assistantToolCall: { create: mocks.create, updateMany: mocks.updateMany } },
}));

import { processAssistantToolCalls } from "./tool-steps";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.create.mockImplementation(async ({ data }) => ({
    ...data,
    id: `row-${mocks.create.mock.calls.length}`,
    maxCostCents: null,
    estimatedCostCents: null,
  }));
  mocks.updateMany.mockResolvedValue({ count: 1 });
});

test("one step's calls form one turn and its signed reasoning is kept for a resume", async () => {
  const reasoning = [
    { type: "reasoning" as const, text: "", providerOptions: { anthropic: { signature: "s" } } },
  ];
  const select = (id: string) => ({
    id,
    name: "select_tool_groups",
    argumentsJson: JSON.stringify({ groups: ["keywords"] }),
  });
  const processed = await processAssistantToolCalls({
    calls: [select("a"), select("b")],
    runId: "run",
    conversationId: "conversation",
    projectId: "project",
    projectPublicId: "prj_test",
    principal: { userId: "user" } as never,
    readOnly: false,
    onUpdate: vi.fn(),
    turn: { step: 2, reasoning },
  });
  expect(processed.history.map((item) => `${item.type}:${"id" in item ? item.id : ""}`)).toEqual([
    "tool_call:a",
    "tool_call:b",
    "tool_result:a",
    "tool_result:b",
  ]);
  expect(mocks.updateMany).toHaveBeenCalledWith({
    where: {
      runId: "run",
      OR: [
        { result: { path: ["providerCallId"], equals: "a" } },
        { result: { path: ["providerCallId"], equals: "b" } },
      ],
    },
    data: { step: 2 },
  });
  expect(mocks.updateMany).toHaveBeenCalledWith({
    where: { runId: "run", result: { path: ["providerCallId"], equals: "a" } },
    data: { providerReasoning: reasoning },
  });
});
test("a read-only role cannot propose a write tool even when the model names one", async () => {
  const processed = await processAssistantToolCalls({
    calls: [{ id: "w", name: "add_keywords", argumentsJson: JSON.stringify({ keywords: ["x"] }) }],
    runId: "run",
    conversationId: "conversation",
    projectId: "project",
    projectPublicId: "prj_test",
    principal: { userId: "user" } as never,
    readOnly: true,
    onUpdate: vi.fn(),
  });
  expect(mocks.create).toHaveBeenCalledTimes(1);
  expect(mocks.create.mock.calls[0][0].data).toMatchObject({
    toolName: "add_keywords",
    category: "excluded",
    status: "blocked",
  });
  expect(processed.waiting).toBe(false);
  expect(processed.history.at(-1)).toMatchObject({ result: { error: "tool unavailable" } });
});
