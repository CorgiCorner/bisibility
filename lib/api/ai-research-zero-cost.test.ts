import { describe, expect, it, vi } from "vitest";
import { postAiVisibility, postPromptExplorer } from "./ai-research";
import type { ApiContext } from "./context";

const mocks = vi.hoisted(() => ({ analyze: vi.fn(), compare: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/ai-research/service", () => ({
  analyzeAiVisibility: mocks.analyze,
  compareAiPrompts: mocks.compare,
}));
vi.mock("@/lib/ai-research/catalog-service", () => ({}));

const projectId = "prj_a00000000000000000000000";
describe.each([
  ["visibility", postAiVisibility, mocks.analyze],
  ["prompt", postPromptExplorer, mocks.compare],
] as const)("%s cache-only REST refusal", (kind, handler, service) => {
  it("preserves the machine-readable refusal price", async () => {
    const url = new URL(`https://example.com/api/v1/projects/${projectId}/${kind}`);
    const input = {
      brand: "Example",
      domain: "example.com",
      max_cost_cents: 0,
      ...(kind === "prompt" ? { prompt: "Which tools?" } : {}),
    };
    const ctx = {
      auth: { project: { id: "project_1", publicId: projectId } },
      headers: new Headers(),
      instance: "urn:test",
      method: "POST",
      url,
      origin: {
        source: "api",
        surface: "programmatic",
        credentialKind: "project_key",
        credentialId: "fixture",
      },
      req: new Request(url, {
        method: "POST",
        body: JSON.stringify(input),
        headers: { "Content-Type": "application/json" },
      }),
    } as ApiContext;
    service.mockResolvedValue({
      ok: false,
      reason: "cost_limit_exceeded",
      estimatedCostCents: 12.3,
      message: "Result is not cached.",
    });
    const response = await handler(ctx, projectId);
    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({
      type: "https://bisibility.com/problems/cost_limit_exceeded",
      errors: { reason: "cost_limit_exceeded" },
      details: { estimated_cost_cents: 12.3 },
    });
    expect(service).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ max_cost_cents: 0 }),
    );
  });
});
