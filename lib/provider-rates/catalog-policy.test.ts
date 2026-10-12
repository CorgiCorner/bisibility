import type { Prisma } from "@/lib/generated/prisma/client";
import { ownCredentialVersion } from "@/lib/provider-usage/credential-version";
import { beforeEach, expect, test, vi } from "vitest";
import { loadNativeCatalogPolicy, nativeProviderCatalog } from "./catalog-policy";
import type { NativePriceBinding } from "./native-price-samples";

const measured = vi.hoisted(() => vi.fn());
vi.mock("./native-price-query", () => ({ loadNativeMeasuredPrice: measured }));
vi.mock("@/lib/metering/runtime", () => ({ meteringNamespace: () => "test" }));
const operation = "dataforseo_labs.google.keyword_overview.live";
const binding: NativePriceBinding = {
  namespace: "test",
  principal: "owner",
  projectId: "project",
  connectionId: "connection",
  provider: "dataforseo",
  fundingSource: "byok",
  providerCredentialVersion: ownCredentialVersion("dataforseo", "connection", "encrypted") ?? "",
};
const connection = {
  projectId: "project",
  provider: "dataforseo",
  credentialSource: "own",
  credentialsEncrypted: "encrypted",
  enabled: true,
  status: "connected",
  project: { ownerId: "owner" },
  rates: [{ amountCents: "0" }],
};
function database(row = connection) {
  return {
    providerConnection: { findUnique: vi.fn().mockResolvedValue(row) },
    $queryRaw: vi.fn(),
  } as unknown as Pick<Prisma.TransactionClient, "providerConnection" | "$queryRaw">;
}
beforeEach(() => {
  measured.mockReset();
  vi.setSystemTime(new Date("2026-10-11T12:00:00Z"));
});

test("manual item rate, including zero, retains the catalog base and skips measured reads", async () => {
  const policy = await loadNativeCatalogPolicy(database(), binding, "keyword_metrics", operation, {
    itemCount: "5",
  });
  expect(policy).toMatchObject({
    fundingSource: "byok",
    manualPriceBasis: { [operation]: "item" },
    manualPrices: { [operation]: { unit: "cents", value: 0n, scale: 0 } },
  });
  expect(measured).not.toHaveBeenCalled();
  const quote = nativeProviderCatalog.estimate({ ...policy, id: binding.connectionId }, operation, {
    itemCount: "5",
  });
  expect(quote.source).toBe("manual");
  expect(quote.quantities.find((q) => q.unit === "cents")?.value).toBeGreaterThan(0n);
});

test.each([
  { namespace: "foreign" },
  { fundingSource: "platform" as const },
  { principal: "other" },
  { projectId: "other" },
  { providerCredentialVersion: "rotated" },
  { provider: "other" },
])("rejects a foreign or stale binding before reading measurements: %j", async (override) => {
  await expect(
    loadNativeCatalogPolicy(
      database(),
      { ...binding, ...override },
      "keyword_metrics",
      operation,
      {},
    ),
  ).rejects.toThrow();
  expect(measured).not.toHaveBeenCalled();
});

test("a feature rate never prices a different operation", async () => {
  await loadNativeCatalogPolicy(database(), binding, "rank_check", operation, {});
  expect(measured).toHaveBeenCalledTimes(1);
});

test.each(["0", "1.55"])(
  "ranked-keyword manual rate %s keeps its per-call meaning",
  async (amount) => {
    const operation = "dataforseo_labs.google.ranked_keywords.live";
    const policy = await loadNativeCatalogPolicy(
      database({ ...connection, rates: [{ amountCents: amount }] }),
      binding,
      "ranked_keywords",
      operation,
      { itemCount: "100" },
    );
    const quote = nativeProviderCatalog.estimate(
      { ...policy, id: binding.connectionId },
      operation,
      {
        itemCount: "100",
      },
    );
    expect(policy.manualPriceBasis).toEqual({ [operation]: "call" });
    expect(quote.source).toBe("manual");
    expect(quote.quantities.find((quantity) => quantity.unit === "cents")).toEqual(
      amount === "0"
        ? { unit: "cents", value: 0n, scale: 0 }
        : { unit: "cents", value: 155n, scale: 2 },
    );
    expect(measured).not.toHaveBeenCalled();
  },
);
