import { prisma } from "@/lib/db/prisma";
import { mapsFixture, receiptTime } from "@/lib/providers/local-search/maps-test-fixtures";
import { decimalQuantity } from "@usagekit/providers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadNativeCatalogPolicy, nativeProviderCatalog } from "./catalog-policy";
import { MAPS_POST_OPERATION, MAPS_PRICE_EXPIRES_AT } from "./dataforseo-maps-module";
import { loadNativeProviderQuote } from "./native-quote";

vi.mock("@/lib/db/prisma", () => ({ prisma: {} }));
// Trusted read policy is the only fake boundary; quote resolution uses the installed real catalog.
vi.mock("./catalog-policy", async (original) => ({
  ...(await original<typeof import("./catalog-policy")>()),
  loadNativeCatalogPolicy: vi.fn(),
}));
const binding = {
  namespace: "test",
  principal: "owner",
  projectId: "project",
  connectionId: "connection",
  provider: "dataforseo",
  providerCredentialVersion: "key-version",
  fundingSource: "byok" as const,
};
function measured(amount: string) {
  vi.mocked(loadNativeCatalogPolicy).mockResolvedValue({
    provider: "dataforseo",
    fundingSource: "byok",
    measured: () => ({
      quantity: decimalQuantity(amount, "cents"),
      samples: 9,
      basis: "call",
      checkedAt: receiptTime.toISOString(),
    }),
  });
}
async function quote() {
  const f = mapsFixture();
  const match = nativeProviderCatalog.match("dataforseo", f.request);
  if (match.operation === "unknown") throw new Error("Actual Maps descriptor missing.");
  const actual = await loadNativeProviderQuote(
    prisma,
    binding,
    "local_scan",
    match.operation.id,
    match.options,
    receiptTime,
  );
  const floor = nativeProviderCatalog.estimate(
    { id: binding.connectionId, provider: "dataforseo", fundingSource: "byok" },
    MAPS_POST_OPERATION,
    match.options,
  );
  return { actual, floor };
}
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(receiptTime);
  vi.mocked(loadNativeCatalogPolicy).mockReset();
});
afterEach(() => vi.useRealTimers());
describe("Maps measured receipt pricing and retained current catalog floor", () => {
  it("retains floor provenance after sufficient measured receipts without replacing their amount", async () => {
    measured("0.06");
    const { actual, floor } = await quote();
    expect(floor.source).toBe("list");
    expect(floor.priceVersion).toBeTruthy();
    expect(actual).toMatchObject({
      source: "measured",
      sampleSize: 9,
      checkedAt: receiptTime.toISOString(),
      priceVersion: floor.priceVersion,
    });
    expect(actual.quantities.find((q) => q.unit === "cents")).toEqual(
      decimalQuantity("0.06", "cents"),
    );
  });
  it("keeps a higher measured amount for exact consent and budget enforcement", async () => {
    measured("0.07");
    const { actual, floor } = await quote();
    expect(actual.priceVersion).toBe(floor.priceVersion);
    expect(actual.source).toBe("measured");
    expect(actual.quantities.find((q) => q.unit === "cents")).toEqual(
      decimalQuantity("0.07", "cents"),
    );
  });
  it("does not use measured receipts below the documented standard task floor", async () => {
    measured("0.01");
    const { actual } = await quote();
    expect(actual.quantities.find((q) => q.unit === "cents")).toEqual(
      decimalQuantity("0.06", "cents"),
    );
  });
  it("cannot recover a price version when the source window has expired", async () => {
    measured("0.07");
    vi.setSystemTime(new Date(MAPS_PRICE_EXPIRES_AT));
    await expect(quote()).rejects.toThrow("confirmed monetary estimate");
  });
});
