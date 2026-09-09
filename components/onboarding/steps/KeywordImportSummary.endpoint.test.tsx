import { costEstimateFixture } from "@/tests/cost-estimate";
import { render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { KeywordImportSummary } from "./KeywordImportSummary";

afterEach(() => vi.unstubAllGlobals());

it("shows endpoint quantities instead of multiplying the draft locally", async () => {
  const data = costEstimateFixture({
    keywordCount: 3,
    locationCount: 2,
    deviceCount: 2,
    depth: 20,
    frequency: "daily",
  }).data;
  const fetcher = vi.fn(async () =>
    Response.json({ data: { ...data, result_pages_per_run: 77, monthly_billing_units: 2310 } }),
  );
  vi.stubGlobal("fetch", fetcher);
  render(
    <KeywordImportSummary
      devices={["desktop", "mobile"]}
      keywordCount={3}
      locationCount={2}
      serpDepth={20}
      frequency="daily"
    />,
  );
  expect(await screen.findByText("Up to 77 result pages per run · 2 markets")).toBeVisible();
  expect(screen.getByText("≈ 2310 result pages/month at Top 20")).toBeVisible();
  expect(fetcher).toHaveBeenCalledWith(
    "/api/v1/cost-estimate?keywords=3&locations=2&devices=2&depth=20&frequency=daily&provider=dataforseo&option=live",
    expect.objectContaining({ signal: expect.any(AbortSignal) }),
  );
});
