import type { Prisma } from "@/lib/generated/prisma/client";
import { ownCredentialVersion } from "@/lib/provider-usage/credential-version";
import { formatQuantity } from "@usagekit/core";
import { beforeEach, expect, test, vi } from "vitest";
import { loadNativeProviderQuote } from "./native-quote";

const measured = vi.hoisted(() => vi.fn());
vi.mock("./native-price-query", () => ({ loadNativeMeasuredPrice: measured }));
vi.mock("@/lib/metering/runtime", () => ({ meteringNamespace: () => "test" }));
const binding = {
  namespace: "test",
  principal: "owner",
  projectId: "project",
  connectionId: "connection",
  provider: "serpapi",
  fundingSource: "byok" as const,
  providerCredentialVersion: ownCredentialVersion("serpapi", "connection", "encrypted") ?? "",
};
function database(amount?: string) {
  return {
    providerConnection: {
      findUnique: vi.fn().mockResolvedValue({
        projectId: "project",
        provider: "serpapi",
        credentialSource: "own",
        credentialsEncrypted: "encrypted",
        enabled: true,
        status: "connected",
        project: { ownerId: "owner" },
        rates: amount === undefined ? [] : [{ amountCents: amount }],
      }),
    },
    $queryRaw: vi.fn(),
  } as unknown as Pick<Prisma.TransactionClient, "providerConnection" | "$queryRaw">;
}
beforeEach(() => {
  vi.setSystemTime(new Date("2026-10-11T12:00:00Z"));
  measured.mockReset();
});
test("subscription search keeps native units and zero marginal money separate from budget value", async () => {
  const quote = await loadNativeProviderQuote(database(), binding, "rank_check", "search", {});
  expect(quote.source).toBe("list");
  expect(quote.quantities).toEqual(
    expect.arrayContaining([
      { unit: "cents", value: 0n, scale: 0 },
      { unit: "units", value: 1n, scale: 0 },
      { unit: "budget_cents", value: 1n, scale: 0 },
    ]),
  );
  expect(quote.budgetValuation).toMatchObject({ source: "reference", perUnitCents: "1" });
  expect(measured).not.toHaveBeenCalled();
});
test.each(["0", "3", "0.0001"])("manual %s remains the total for ten pages", async (amount) => {
  const quote = await loadNativeProviderQuote(
    database(amount),
    binding,
    "rank_check",
    "search",
    {},
    new Date(),
    10,
  );
  const value = quote.quantities.find((q) => q.unit === "budget_cents");
  if (!value) throw new Error("Missing budget valuation");
  expect(Number(formatQuantity(value)) * 10).toBe(Number(amount));
  expect(quote.quantities).toContainEqual({ unit: "cents", value: 0n, scale: 0 });
  expect(quote.budgetValuation).toMatchObject({ source: "manual", unitsPerCheck: 10 });
});
test("an unsupported search valuation cannot borrow a rank-check override", async () => {
  await expect(
    loadNativeProviderQuote(database("3"), binding, "keyword_metrics", "search", {}),
  ).rejects.toThrow();
});
