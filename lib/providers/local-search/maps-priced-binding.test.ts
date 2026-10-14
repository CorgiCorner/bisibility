import type { LocalQuote } from "@/lib/local-monitoring/quote";
import { executionTargetKey } from "@/lib/local-monitoring/target-key";
import {
  assertMapsPricedRequest,
  assertMapsTaskset,
} from "@/lib/local-monitoring-host/maps-pricing";
import { describe, expect, it, vi } from "vitest";
import { sumMapsNative } from "./maps-native-quantity";
import { mapsFixture, pricedMapsFixture, receiptTime } from "./maps-test-fixtures";

vi.mock("@/lib/provider-rates/native-quote", () => ({ loadNativeProviderQuote: vi.fn() }));
vi.mock("@/lib/metering/runtime", () => ({ meteringNamespace: () => "synthetic" }));
function quoteFixture(): LocalQuote {
  const f = mapsFixture();
  return {
    version: 1,
    projectId: f.binding.target.projectId,
    expectedTargetKeys: [executionTargetKey(f.binding.target)],
    effectiveOptions: { surface: "maps", priority: "normal" },
    capabilityVersion: f.capability.version,
    provider: "dataforseo",
    adapterVersion: f.capability.adapterVersion,
    providerPriceVersion: f.record.providerPriceVersion,
    nativeEstimates: sumMapsNative([f.quote.quantities]),
    issuedAt: receiptTime.toISOString(),
    expiresAt: f.capability.expiresAt,
  };
}
describe("real nominal Maps request and native taskset binding", () => {
  it("accepts the original and ignores only the separately reserved internal unit counter", async () => {
    const f = await pricedMapsFixture(true);
    expect(() =>
      assertMapsPricedRequest(
        f.priced,
        f.request,
        f.binding.target.projectId,
        f.record.providerPriceVersion,
      ),
    ).not.toThrow();
    expect(() => assertMapsTaskset(quoteFixture(), [f.priced])).not.toThrow();
  });
  it("matches canonical host admission without treating budget and attempt counters as provider units", async () => {
    const f = await pricedMapsFixture(true, true);
    expect(sumMapsNative([f.priced.estimate])).toEqual([
      { unit: "budget_cents", amount: "0.06" },
      { unit: "cents", amount: "0.06" },
      { unit: "paid_attempts", amount: "1" },
      { unit: "requests", amount: "1" },
      { unit: "units", amount: "1" },
    ]);
    expect(() => assertMapsTaskset(quoteFixture(), [f.priced])).not.toThrow();
    expect(() =>
      assertMapsTaskset(
        {
          ...quoteFixture(),
          nativeEstimates: [
            { unit: "cents", amount: "0.05" },
            { unit: "requests", amount: "1" },
          ],
        },
        [f.priced],
      ),
    ).toThrow();
  });
  it("rejects changed project, quoted price version and request body", async () => {
    const f = await pricedMapsFixture();
    expect(() =>
      assertMapsPricedRequest(
        f.priced,
        f.request,
        "another-project",
        f.record.providerPriceVersion,
      ),
    ).toThrow();
    expect(() =>
      assertMapsPricedRequest(f.priced, f.request, f.binding.target.projectId, "another-price"),
    ).toThrow();
    expect(() =>
      assertMapsPricedRequest(
        f.priced,
        { ...f.request, body: [] },
        f.binding.target.projectId,
        f.record.providerPriceVersion,
      ),
    ).toThrow();
  });
  it("rejects missing/duplicate admission IDs and altered native totals", async () => {
    const f = await pricedMapsFixture();
    expect(() => assertMapsTaskset(quoteFixture(), [])).toThrow();
    expect(() =>
      assertMapsTaskset({ ...quoteFixture(), expectedTargetKeys: ["first", "second"] }, [
        f.priced,
        f.priced,
      ]),
    ).toThrow();
    expect(() =>
      assertMapsTaskset({ ...quoteFixture(), nativeEstimates: [{ unit: "cents", amount: "0" }] }, [
        f.priced,
      ]),
    ).toThrow();
  });
});
