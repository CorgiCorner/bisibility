import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  canReadDetailedHealth: vi.fn(),
  checkRateLimit: vi.fn(),
  getHealth: vi.fn(),
}));

vi.mock("./discovery", () => ({
  capabilities: vi.fn(),
  getHealth: mocks.getHealth,
  getLiveness: vi.fn(),
  getOpenApi: vi.fn(),
  getReadiness: vi.fn(),
  llmsText: vi.fn(),
}));
vi.mock("./probe-auth", () => ({ canReadDetailedHealth: mocks.canReadDetailedHealth }));
vi.mock("./public-cost", () => ({ getCostEstimate: vi.fn(), getProviderRates: vi.fn() }));
vi.mock("./ratelimit", () => ({
  checkRateLimit: mocks.checkRateLimit,
  rateLimitExceeded: vi.fn(),
}));

import { handleDiscovery } from "./discovery-router";

describe("discovery health routing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.checkRateLimit.mockResolvedValue({ headers: new Headers(), success: true });
    mocks.getHealth.mockReturnValue(new Response(null, { status: 200 }));
  });

  it("passes probe authorization and preauthentication into detailed health", async () => {
    const req = new Request("https://example.com/api/v1/health");
    mocks.canReadDetailedHealth.mockResolvedValue(true);

    await handleDiscovery(req, ["health"], true);

    expect(mocks.canReadDetailedHealth).toHaveBeenCalledWith(req, true);
    expect(mocks.getHealth).toHaveBeenCalledWith(expect.objectContaining({ success: true }), true);
  });
});
