import type { Prisma } from "@/lib/generated/prisma/client";
import { beforeEach, expect, test, vi } from "vitest";
import { loadNativeProviderRates } from "./native-rates";
import type { ProviderUiState, StoredUiConnection } from "./state";

const measured = vi.hoisted(() => vi.fn());
vi.mock("@/lib/provider-rates/native-price-query", () => ({ loadNativeMeasuredPrice: measured }));
vi.mock("@/lib/metering/runtime", () => ({ meteringNamespace: () => "test" }));
const connection: StoredUiConnection = {
  id: "internal",
  publicId: "public",
  provider: "dataforseo",
  status: "connected",
  priority: 0,
  enabled: true,
  hasStoredCredentials: true,
  credentialSource: "own",
  providerUiRevision: "1",
  updatedAt: new Date("2026-10-01"),
  rates: [],
};
const state = {
  project: { id: "project", ownerId: "owner" },
  binding: { canManage: true },
} as Pick<ProviderUiState, "project" | "binding">;
function database(rates: Record<string, string> = {}, provider = connection.provider) {
  const findUnique = vi.fn(async (query) => ({
    id: connection.id,
    provider,
    projectId: state.project.id,
    project: { ownerId: state.project.ownerId },
    enabled: true,
    status: "connected",
    credentialSource: "own",
    credentialsEncrypted: "SYNTHETIC-SECRET-NEVER-RETURN",
    rates: (query.select.rates?.where.feature.in ?? []).flatMap((feature: string) =>
      rates[feature] === undefined ? [] : [{ amountCents: rates[feature] }],
    ),
  }));
  return {
    providerConnection: { findUnique },
    $queryRaw: vi.fn(),
  } as unknown as Pick<Prisma.TransactionClient, "providerConnection" | "$queryRaw">;
}
beforeEach(() => {
  vi.setSystemTime(new Date("2026-10-11T12:00:00Z"));
  measured.mockReset();
});

test("shows a full 100-keyword request separately from the editable item coefficient", async () => {
  const rows = await loadNativeProviderRates(database(), state, connection);
  expect(rows.find((row) => row.id === "keyword_metrics")).toMatchObject({
    unit: "keyword",
    editable: true,
    price: { certainty: "unknown" },
  });
  expect(rows.find((row) => row.id === "request:keyword_metrics:standard")).toMatchObject({
    label: "Keyword overview (100)",
    unit: "request",
    editable: false,
    price: { text: "2.4", certainty: "estimated" },
    provenance: { source: "list" },
  });
});

test("uses exact current credential and variant measurements without pooling clickstream", async () => {
  measured.mockImplementation(async (_db, binding, operation, options) => {
    expect(binding).toMatchObject({
      namespace: "test",
      principal: "owner",
      connectionId: "internal",
      fundingSource: "byok",
    });
    return operation.endsWith("keyword_overview.live") && options.clickstream === "false"
      ? {
          quantity: { value: 725n, scale: 2, unit: "cents" },
          samples: 5,
          basis: "call",
          checkedAt: "2026-10-10T00:00:00Z",
        }
      : undefined;
  });
  const rows = await loadNativeProviderRates(database(), state, connection);
  expect(rows.find((row) => row.id === "request:keyword_metrics:standard")).toMatchObject({
    price: { text: "7.25", certainty: "measured" },
    provenance: { source: "measured", sampleSize: "5" },
  });
  expect(rows.find((row) => row.id === "request:keyword_metrics:clickstream")).toMatchObject({
    price: { text: "4.8" },
    provenance: { source: "list", sampleSize: null },
  });
  expect(JSON.stringify(rows)).not.toMatch(
    /SYNTHETIC-SECRET|providerCredentialVersion|"owner"|"internal"/,
  );
});

test("manual zero item price retains the request base and required clickstream floor", async () => {
  const rows = await loadNativeProviderRates(database({ keyword_metrics: "0" }), state, connection);
  expect(rows.find((row) => row.id === "request:keyword_metrics:standard")).toMatchObject({
    price: { text: "1.2" },
    provenance: { source: "manual" },
  });
  expect(rows.find((row) => row.id === "request:keyword_metrics:clickstream")).toMatchObject({
    price: { text: "4.8" },
    provenance: { source: "manual" },
  });
});

test("does not invent a history row count", async () => {
  const rows = await loadNativeProviderRates(database(), state, connection);
  expect(rows.find((row) => row.id === "request:historical_rank_overview:standard")).toMatchObject({
    price: { certainty: "unknown" },
    provenance: { source: "unknown" },
    editable: false,
  });
});

test("disconnected credentials show unavailable quote evidence without database access", async () => {
  const db = database();
  const rows = await loadNativeProviderRates(db, state, { ...connection, status: "needs_reauth" });
  expect(db.providerConnection.findUnique).not.toHaveBeenCalled();
  for (const row of rows.filter((value) => value.id.startsWith("request:")))
    expect(row.price).toMatchObject({ certainty: "unknown" });
});

test("database errors remain read failures rather than made-up list prices", async () => {
  const db = database();
  vi.mocked(db.providerConnection.findUnique).mockRejectedValue(new Error("database unavailable"));
  await expect(loadNativeProviderRates(db, state, connection)).rejects.toThrow(
    "database unavailable",
  );
});

test.each([undefined, "0", "3"])(
  "search UI labels a full-check budget valuation %s",
  async (manual) => {
    const rows = await loadNativeProviderRates(
      database(manual === undefined ? {} : { rank_check: manual }, "serpapi"),
      state,
      { ...connection, provider: "serpapi" },
    );
    const quotes = rows.filter((row) => row.id.startsWith("request:"));
    expect(
      quotes.map((row) => (typeof row.price === "object" ? row.price.text : row.price)),
    ).toEqual(manual === undefined ? ["1", "10"] : [manual, manual]);
    expect(quotes.every((row) => row.label.includes("budget value"))).toBe(true);
    expect(quotes.every((row) => row.provenance.origin === "host")).toBe(true);
    expect(measured).not.toHaveBeenCalled();
  },
);
