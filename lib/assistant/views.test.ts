import type { AssistantRun, AssistantToolCall } from "@/lib/generated/prisma/client";
import { expect, test } from "vitest";
import { assistantRunView, assistantToolCallView } from "./views";

test("approval preview shows bounded keyword targets without exposing secrets", () => {
  const call = {
    id: "call",
    toolName: "add_keywords",
    category: "mutation",
    status: "proposed",
    args: {
      project_id: "prj_test",
      keywords: ["first", { keyword: "second", secret: "hidden" }],
      api_key: "hidden",
      max_cost_cents: 100,
      idempotency_key: "hidden",
      target_url: "https://example.com/page",
    },
    maxCostCents: null,
    estimatedCostCents: null,
    expiresAt: new Date(),
    argsHash: "hash",
    result: null,
  } as unknown as AssistantToolCall;
  const view = assistantToolCallView(call);
  expect(view.argsPreview).toEqual([
    { label: "Keywords", value: "first, second" },
    { label: "Target url", value: "https://example.com/page" },
  ]);
  expect(view.summary).toContain(view.title);
  expect(JSON.stringify(view)).not.toContain("hidden");
});

test("an unconfirmed run keeps its settled subtotal as a lower bound", () => {
  const run = {
    id: "run",
    status: "unknown",
    modelId: "m",
    provider: "openai",
    funding: "credits",
    createdAt: new Date(0),
    finishedAt: null,
    errorCode: null,
    inputTokens: 3,
    outputTokens: 4,
    costMicroUsd: "12",
    costCertainty: "unknown",
  } as unknown as AssistantRun;
  expect(assistantRunView(run, [{ status: "unknown" }]).usage).toEqual({
    inputTokens: 3,
    outputTokens: 4,
    costMicroUsd: "12",
    certainty: "unknown",
    chargedCents: null,
  });
  // The Credits amount the run was charged comes from the ledger, passed in by the caller.
  expect(assistantRunView(run, [], "3.1000").usage?.chargedCents).toBe("3.1000");
});
