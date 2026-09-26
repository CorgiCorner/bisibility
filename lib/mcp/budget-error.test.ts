import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ handleApiRequest: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/api/router", () => ({
  handleApiRequest: mocks.handleApiRequest,
  handleMcpPreauthenticatedApiRequest: vi.fn(),
}));

import { budgetExhaustedMessage, isBudgetExhaustedProblem } from "./result";
import { createBisibilityMcpServer } from "./server";

const budgetProblem = {
  detail: "API, MCP and SDK budget reached for September 2026.",
  details: { resets_at: "2026-10-01T00:00:00Z", surface: "programmatic" },
  docs_url: "https://bisibility.com/docs/api/errors#budget_exhausted",
  instance: "urn:bisibility:api:v1:/projects",
  status: 429,
  title: "Budget exhausted",
  type: "https://bisibility.com/problems/budget_exhausted",
};

async function callListProjects() {
  const server = createBisibilityMcpServer({ authorization: "bsb_key_live_test" });
  const client = new Client({ name: "budget-error-test", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  return client.callTool({ arguments: {}, name: "list_projects" });
}

describe("MCP budget-exhausted tool errors", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("derives the agent-facing message from the problem reset time", () => {
    expect(budgetExhaustedMessage(budgetProblem)).toBe(
      "Provider budget for API, MCP and SDK is exhausted until Oct 1. Ask the project owner to raise it in Settings > Usage.",
    );
  });

  it("falls back to next month when the problem carries no reset time", () => {
    const payload = {
      details: { surface: "programmatic" },
      type: "https://bisibility.com/problems/budget_exhausted",
    } as const;
    expect(budgetExhaustedMessage(payload)).toContain("exhausted until next month.");
  });

  it("recognizes only budget problem types", () => {
    expect(isBudgetExhaustedProblem(budgetProblem)).toBe(true);
    expect(isBudgetExhaustedProblem({ type: "https://bisibility.com/problems/rate_limited" })).toBe(
      false,
    );
    expect(isBudgetExhaustedProblem("budget_exhausted")).toBe(false);
  });

  it("surfaces the budget sentence as an actionable tool error", async () => {
    mocks.handleApiRequest.mockResolvedValue(
      Response.json(budgetProblem, { status: 429, headers: { "Retry-After": "60" } }),
    );

    const result = await callListProjects();

    expect(result.isError).toBe(true);
    const text = (result.content as Array<{ text: string }>).find(
      (item) => typeof item.text === "string",
    )?.text;
    const serialized = JSON.parse(text ?? "{}").error as Record<string, unknown>;
    expect(serialized.message).toBe(
      "Provider budget for API, MCP and SDK is exhausted until Oct 1. Ask the project owner to raise it in Settings > Usage.",
    );
    expect(serialized.code).toBe("budget_exhausted");
    expect(serialized.status).toBe(429);
    expect(serialized.payload).toEqual(budgetProblem);
    expect((result.structuredContent as { error: Record<string, unknown> }).error.status).toBe(429);
  });

  it("keeps the generic failure message for other problems", async () => {
    mocks.handleApiRequest.mockResolvedValue(
      Response.json(
        { status: 422, title: "Not found", type: "https://bisibility.com/problems/not_found" },
        { status: 422 },
      ),
    );

    const result = await callListProjects();

    expect(result.isError).toBe(true);
    const text = (result.content as Array<{ text: string }>).find(
      (item) => typeof item.text === "string",
    )?.text;
    const serialized = JSON.parse(text ?? "{}").error as Record<string, unknown>;
    expect(serialized.message).toBe("bisibility API request failed.");
    expect(serialized.code).toBeUndefined();
  });

  it("serializes deployment credits as an actionable 402 while retaining the raw problem", async () => {
    const problem = {
      detail: "Deployment credits are exhausted.",
      instance: "urn:bisibility:api:v1:/api/v1/projects",
      status: 402,
      type: "https://bisibility.com/problems/credits_exhausted",
    };
    mocks.handleApiRequest.mockResolvedValue(Response.json(problem, { status: 402 }));
    const result = await callListProjects();
    const serialized = (result.structuredContent as { error: Record<string, unknown> }).error;
    expect(result.isError).toBe(true);
    expect(serialized).toMatchObject({
      code: "credits_exhausted",
      message: expect.stringContaining("Billing in project settings"),
      payload: problem,
      status: 402,
    });
    expect(JSON.parse((result.content as Array<{ text: string }>)[0].text).error).toMatchObject({
      code: "credits_exhausted",
      payload: problem,
      status: 402,
    });
  });

  it.each([
    "https://evil.example.com/app/prj_abcdefghijklmnopqrstuvwx/settings/billing",
    "//evil.example.com/app/prj_abcdefghijklmnopqrstuvwx/settings/billing",
    "/app/settings/billing",
    "/app/prj_abcdefghijklmnopqrstuvwx/settings/billing?next=https://evil.example.com",
  ])("ignores untrusted top-up paths in actionable text: %s", async (topUpUrl) => {
    mocks.handleApiRequest.mockResolvedValue(
      Response.json(
        {
          details: { top_up_url: topUpUrl },
          status: 402,
          type: "https://bisibility.com/problems/credits_exhausted",
        },
        { status: 402 },
      ),
    );
    const result = await callListProjects();
    const serialized = (result.structuredContent as { error: Record<string, unknown> }).error;
    expect(serialized.message).toContain("Billing in project settings");
    expect(serialized.message).not.toContain(topUpUrl);
  });

  it("uses a validated relative project Billing path when present", async () => {
    const path = "/app/prj_abcdefghijklmnopqrstuvwx/settings/billing";
    mocks.handleApiRequest.mockResolvedValue(
      Response.json(
        {
          details: { top_up_url: path },
          status: 402,
          type: "https://bisibility.com/problems/credits_exhausted",
        },
        { status: 402 },
      ),
    );
    const result = await callListProjects();
    expect((result.structuredContent as { error: { message: string } }).error.message).toContain(
      path,
    );
  });
});
