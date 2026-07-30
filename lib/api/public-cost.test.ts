import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { handleApiRequest } from "./router";

const mocks = vi.hoisted(() => ({
  authenticateBearer: vi.fn(() => {
    throw new Error("Public cost endpoints must not require API-key auth.");
  }),
  checkRateLimit: vi.fn(() => Promise.resolve({ headers: new Headers(), success: true })),
  prisma: { $queryRaw: vi.fn() },
  rateLimitExceeded: vi.fn(),
}));

vi.mock("./auth", () => ({
  ApiAuthError: class ApiAuthError extends Error {},
  authenticateBearer: mocks.authenticateBearer,
}));

vi.mock("./ratelimit", () => ({
  checkRateLimit: mocks.checkRateLimit,
  rateLimitExceeded: mocks.rateLimitExceeded,
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: mocks.prisma,
}));

function anonRequest(path: string) {
  return new Request(`https://example.test/api/v1${path}`, { method: "GET" });
}

async function call(path: string) {
  return handleApiRequest(anonRequest(path), path.split("?")[0].split("/").filter(Boolean));
}

describe("public cost API routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    expect(mocks.authenticateBearer).not.toHaveBeenCalled();
  });

  it("serves provider rates anonymously", async () => {
    const response = await call("/provider-rates");
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          options: expect.arrayContaining([
            expect.objectContaining({
              key: "standard",
              label: "Standard queue",
              short_label: "Standard",
              turnaround: "~5 min",
              additional_page_cost_cents: 0.045,
              top_100_check_cost_cents: 0.465,
              unit_cost_cents: 0.06,
              unit_cost_usd: 0.0006,
            }),
          ]),
          pricing_model: "flat",
          provider_id: "dataforseo",
        }),
        expect.objectContaining({
          plans: expect.arrayContaining([
            expect.objectContaining({
              included_checks: 5000,
              monthly_price_cents: 7500,
              monthly_price_usd: 75,
              plan_key: "developer",
            }),
          ]),
          pricing_model: "plan",
          provider_id: "serpapi",
        }),
      ]),
    );
  });

  it("estimates flat provider cost from query params", async () => {
    const response = await call(
      "/cost-estimate?keywords=248&locations=1&devices=1&frequency=daily&provider=dataforseo&option=standard",
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toMatchObject({
      checks_per_run: 248,
      depth: 100,
      billing_units_per_check: 10,
      monthly_billing_units: 74400,
      monthly_checks: 7440,
      monthly_cost_usd: 34.596,
      pricing_model: "flat",
      provider_id: "dataforseo",
      selected_option: expect.objectContaining({
        key: "standard",
        label: "Standard queue",
        short_label: "Standard",
        turnaround: "~5 min",
      }),
    });
    expect(body.data.monthly_cost_cents).toBeCloseTo(3459.6);
  });

  it("prices the requested depth and defaults to top 100", async () => {
    const response = await call(
      "/cost-estimate?keywords=30000&frequency=monthly&provider=dataforseo&option=live&depth=10",
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toMatchObject({
      billing_units_per_check: 1,
      depth: 10,
      monthly_checks: 30000,
      monthly_cost_usd: 60,
    });
  });

  it("selects plans by searches and flags volume beyond public tiers", async () => {
    const response = await call("/cost-estimate?keywords=5000&frequency=monthly&provider=serpapi");
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toMatchObject({
      billing_units_per_check: 10,
      exceeds_largest_plan: true,
      monthly_billing_units: 50000,
      monthly_checks: 5000,
      monthly_cost_cents: 27500,
      pricing_model: "plan",
      provider_id: "serpapi",
      selected_plan: expect.objectContaining({ plan_key: "bigdata" }),
    });
  });

  it("pins a larger plan provider tier from the plan query param", async () => {
    const response = await call(
      "/cost-estimate?keywords=50&frequency=daily&provider=serpapi&plan=production",
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toMatchObject({
      exceeds_largest_plan: false,
      exceeds_selected_plan: false,
      monthly_checks: 1500,
      monthly_cost_cents: 15000,
      selected_plan: expect.objectContaining({ plan_key: "production" }),
    });
  });

  it("flags a pinned plan provider tier that is below volume", async () => {
    const response = await call(
      "/cost-estimate?keywords=50&frequency=daily&provider=serpapi&plan=starter",
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toMatchObject({
      exceeds_largest_plan: false,
      exceeds_selected_plan: true,
      monthly_checks: 1500,
      monthly_cost_cents: 2500,
      selected_plan: expect.objectContaining({ plan_key: "starter" }),
    });
  });

  it.each(["devices=3", "frequency=hourly", "depth=30"])(
    "returns problem json for invalid %s",
    async (invalidParam) => {
      const response = await call(`/cost-estimate?keywords=1&${invalidParam}`);

      expect(response.status).toBe(400);
      expect(response.headers.get("content-type")).toContain("application/problem+json");
      await expect(response.json()).resolves.toMatchObject({
        errors: expect.any(Object),
        status: 400,
        title: "Validation failed",
      });
    },
  );

  it.each(["keywords=100001", "keywords=1&locations=101"])(
    "returns problem json for over-cap %s",
    async (query) => {
      const response = await call(`/cost-estimate?${query}`);

      expect(response.status).toBe(400);
      expect(response.headers.get("content-type")).toContain("application/problem+json");
      await expect(response.json()).resolves.toMatchObject({
        errors: expect.any(Object),
        status: 400,
        title: "Validation failed",
      });
    },
  );

  it("returns not found for unknown providers", async () => {
    const response = await call("/cost-estimate?keywords=1&provider=unknown");

    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).toContain("application/problem+json");
    await expect(response.json()).resolves.toMatchObject({
      status: 404,
      title: "Not found",
    });
  });
});
