import { beforeEach, describe, expect, it, vi } from "vitest";
import { getBacklinks } from "./backlinks";
import type { ApiContext } from "./context";

const mocks = vi.hoisted(() => ({ analyze: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/backlinks/service", () => ({ analyzeBacklinks: mocks.analyze }));

function context(search: string) {
  const url = new URL(`https://example.test/api/v1/projects/prj_1/backlinks${search}`);
  return {
    actorId: "user_1",
    auth: { project: { id: "project_1", publicId: "prj_1" } },
    headers: new Headers({ "RateLimit-Remaining": "99" }),
    instance: "urn:test",
    method: "GET",
    origin: {
      credentialId: "key_test",
      credentialKind: "project_key",
      source: "api",
      surface: "programmatic",
    },
    path: ["projects", "prj_1", "backlinks"],
    req: new Request(url),
    url,
  } as ApiContext;
}

describe("backlinks budget problem responses", () => {
  beforeEach(() => vi.clearAllMocks());

  it("names the provider the exhausted-budget outcome carries", async () => {
    mocks.analyze.mockResolvedValue({
      ok: false,
      provider: "dataforseo",
      reason: "budget_exhausted",
    });

    const response = await getBacklinks(context("?target=acme-store.com"), "prj_1");

    const body = await response.json();
    expect(body.details.provider).toBe("dataforseo");
    expect(body.detail).toContain("dataforseo");
  });

  it("reports the compared estimate on a cost-limit refusal", async () => {
    mocks.analyze.mockResolvedValue({
      estimatedCostCents: 12,
      ok: false,
      reason: "cost_limit_exceeded",
    });

    const response = await getBacklinks(context("?target=acme-store.com"), "prj_1");

    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body.details.estimated_cost_cents).toBe(12);
  });
});
