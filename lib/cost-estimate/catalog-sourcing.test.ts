import { defaultCostPerCheckCents } from "@/lib/rank-check/default-cost";
import { formatQuantity } from "@usagekit/core";
import { createCatalog, dataforseo, serpapi } from "@usagekit/providers";
import { beforeEach, expect, test, vi } from "vitest";
import { flatPerCheckCostCents } from "./estimate";
import { rateForProvider } from "./provider-rates";

beforeEach(() => vi.setSystemTime(new Date("2026-10-11T12:00:00Z")));
const catalog = createCatalog({
  providers: [dataforseo, serpapi],
  enabled: ["dataforseo", "serpapi"],
});

test.each([10, 20, 50, 100] as const)(
  "rank estimates match the shared admission quote at depth %i",
  (depth) => {
    const quote = catalog.estimate(
      { id: "fixture", provider: "dataforseo", fundingSource: "byok" },
      "serp.google.organic.live.advanced",
      { depth: String(depth) },
    );
    const amount = quote.quantities.find((quantity) => quantity.unit === "cents");
    if (!amount) throw new Error("Missing catalog price");
    expect(defaultCostPerCheckCents("dataforseo", depth)).toBe(Number(formatQuantity(amount)));
  },
);

test.each([10, 20, 50, 100] as const)("queue estimates match admission at depth %i", (depth) => {
  const rate = rateForProvider("dataforseo");
  if (rate?.pricingModel !== "flat") throw new Error("Missing queue rates");
  for (const [key, priority] of [
    ["standard", "normal"],
    ["priority", "high"],
  ] as const) {
    const quote = catalog.estimate(
      { id: "fixture", provider: "dataforseo", fundingSource: "byok" },
      "serp.google.organic.task_post",
      { depth: String(depth), priority },
    );
    const amount = quote.quantities.find((quantity) => quantity.unit === "cents");
    const option = rate.options.find((entry) => entry.key === key);
    if (!amount || !option) throw new Error("Missing queue price");
    expect(flatPerCheckCostCents(option, depth)).toBe(Number(formatQuantity(amount)));
  }
});

test("the calculator contains every priced monthly plan from the shared descriptor", () => {
  const rate = rateForProvider("serpapi");
  if (rate?.pricingModel !== "plan") throw new Error("Missing plan table");
  expect(rate.plans.map((plan) => plan.planKey)).toEqual(
    serpapi.descriptor.plans.filter((plan) => plan.subscription).map((plan) => plan.id),
  );
  expect(rate.plans.find((plan) => plan.planKey === "infrastructure")).toMatchObject({
    monthlyPriceCents: 275000,
    includedChecks: 500000,
  });
});

test("price freshness remains the descriptor verification date", () => {
  expect(rateForProvider("serpapi")?.checkedAt).toBe("2026-09-25");
  expect(rateForProvider("dataforseo")?.checkedAt).toBe("2026-09-25");
});
