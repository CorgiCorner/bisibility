import { saveBudget } from "@/lib/metering/store/budgets";
import { createSql } from "@/lib/metering/store/host-sql";
import { ownCredentialVersion } from "@/lib/provider-usage/credential-version";
import { modelAccountDigest } from "@/lib/providers/model/account-scope";
import { ModelCatalogCache } from "@/lib/providers/model/catalog-cache";
import * as registry from "@/lib/providers/model/registry";
import * as providerLimit from "@/lib/providers/rate-limit";
import { afterEach, expect, test, vi } from "vitest";
import { peekModelCatalog } from "./connection-resolution";
import { catalog, entry } from "./contract-fixtures.test-support";
import { estimateModelPlayground } from "./estimate";
import { launchHarness } from "./launch.test-support";
import { previewModelPlayground, unavailableModelValuation } from "./preview";

vi.mock("@/lib/providers/crypto", () => ({
  decryptProviderCredentials: () => ({ apiKey: "synthetic-key" }),
  getPurposeSecretKeys: () => [Buffer.alloc(32, 7)],
}));
vi.mock("@/lib/providers/rate-limit", () => ({
  consumeProviderLimit: vi.fn(async () => ({ success: true })),
}));
const h = launchHarness();
afterEach(() => {
  vi.restoreAllMocks();
  delete h.runtime.peekCatalog;
});

/** Row counts of every table in the fixture schema: model playground, payment, metering, budgets. */
async function rowCounts() {
  return (await tableSnapshot()).counts;
}

/** Row count and content digest of every table, so an UPDATE or insert-then-delete shows up. */
async function tableSnapshot() {
  const tables = await h.sql.query<{ name: string }>(
    `SELECT table_name AS name FROM information_schema.tables
     WHERE table_schema=current_schema() AND table_type='BASE TABLE' ORDER BY table_name`,
  );
  const counts: Record<string, number> = {};
  const digests: Record<string, string> = {};
  for (const { name } of tables.rows) {
    const row = (
      await h.sql.query<{ n: string; digest: string }>(
        `SELECT count(*) AS n, md5(coalesce(string_agg(t::text, ',' ORDER BY t::text), '')) AS digest
         FROM "${name}" t`,
      )
    ).rows[0];
    counts[name] = Number(row.n);
    digests[name] = row.digest;
  }
  return { counts, digests };
}

function cachedCatalog() {
  const column = h.input.columns[0];
  const cache = new ModelCatalogCache();
  const accountDigest = modelAccountDigest(column.providerId, "synthetic-key");
  cache.set(
    {
      providerId: column.providerId,
      accountDigest,
      credentialRevision: ownCredentialVersion(
        column.providerId,
        h.context.columns[0].binding.connectionId,
        "fixture-envelope",
      ) as string,
    },
    catalog({
      accountDigest,
      fetchedAt: h.now.toISOString(),
      expiresAt: new Date(+h.now + 300000).toISOString(),
      models: [entry({ capabilityVersion: "synthetic-v1" })],
    }),
  );
  return cache;
}

test("a cache miss estimates unknown cost without any provider call or written row", async () => {
  const provider = vi.spyOn(registry, "getModelProvider");
  h.runtime.peekCatalog = (db, projectId, request) =>
    peekModelCatalog(db, projectId, request, {
      cache: new ModelCatalogCache(),
    });
  const before = await tableSnapshot();
  const estimate = await estimateModelPlayground(h.runtime, h.input);
  expect(estimate.forecasts).toEqual([
    {
      columnId: h.input.columns[0].columnId,
      money: unavailableModelValuation(h.input.columns[0]).forecast,
      complete: false,
    },
  ]);
  expect(estimate.budgetAvailable).toBe(true);
  expect(estimate).not.toHaveProperty("previewId");
  expect(estimate).not.toHaveProperty("quoteToken");
  expect(await tableSnapshot()).toEqual(before);
  expect(before.counts.model_playground_payment_quotes).toBe(0);
  expect(provider).not.toHaveBeenCalled();
  expect(providerLimit.consumeProviderLimit).not.toHaveBeenCalled();
  expect(h.runtime.resolve).not.toHaveBeenCalled();
  expect(h.adapter.probe).not.toHaveBeenCalled();
  expect(h.calls).toHaveLength(0);
  expect(h.runtime.authorize).toHaveBeenCalledWith("read");
});

test("a cached catalog prices the estimate in memory and still writes nothing", async () => {
  const cache = cachedCatalog();
  h.runtime.peekCatalog = (db, projectId, request) =>
    peekModelCatalog(db, projectId, request, { cache });
  h.runtime.valuation = () => ({
    policy: h.context.columns[0].binding.policy,
    rateCard: h.context.columns[0].binding.rateCard,
    forecast: { ...h.context.columns[0].forecast, amount: "0.25" },
    advisory: { cents: "25", basis: "rate_card" },
  });
  const before = await tableSnapshot();
  const estimate = await estimateModelPlayground(h.runtime, h.input);
  expect(estimate.forecasts[0]).toMatchObject({
    money: { amount: "0.25", certainty: "estimated" },
    complete: true,
  });
  expect(await tableSnapshot()).toEqual(before);
  expect(h.runtime.resolve).not.toHaveBeenCalled();
  expect(h.adapter.probe).not.toHaveBeenCalled();
});

test("a model missing from the cached catalog is refused without a write", async () => {
  const cache = cachedCatalog();
  h.runtime.peekCatalog = (db, projectId, request) =>
    peekModelCatalog(db, projectId, request, { cache });
  h.input.columns[0].modelId = "vendor/unlisted-model";
  const before = await tableSnapshot();
  await expect(estimateModelPlayground(h.runtime, h.input)).rejects.toMatchObject({
    reason: "catalog_changed",
  });
  expect(await tableSnapshot()).toEqual(before);
});

async function saveProjectBudget(version: number, limit: bigint | null) {
  await h.runtime.db.$transaction(async (tx) => {
    await saveBudget(createSql(tx, { statements: 0, changes: 0n, rowsRead: 0 }), {
      id: `project:${h.context.projectId}:monthly`,
      version,
      scope: { kind: "group", namespace: h.context.namespace, group: h.context.projectId },
      surface: "any",
      unit: "budget_cents",
      limit: limit === null ? null : { value: limit, scale: 0, unit: "budget_cents" },
      onExceed: "block",
      window: { kind: "calendar_month", timezone: "UTC" },
    });
  });
}

test("the budget is reported as yes/no only, read without a write", async () => {
  await saveProjectBudget(2, 0n);
  try {
    const before = await tableSnapshot();
    const exhausted = await estimateModelPlayground(h.runtime, h.input);
    expect(exhausted.budgetAvailable).toBe(false);
    expect(Object.keys(exhausted).sort()).toEqual(["budgetAvailable", "estimatedAt", "forecasts"]);
    expect(await tableSnapshot()).toEqual(before);
  } finally {
    await saveProjectBudget(3, null);
  }
  expect((await estimateModelPlayground(h.runtime, h.input)).budgetAvailable).toBe(true);
  const access = await h.runtime.authorize("read");
  vi.mocked(h.runtime.authorize).mockResolvedValueOnce({
    ...access,
    projectId: "prj-without-budget",
  });
  const before = await tableSnapshot();
  expect((await estimateModelPlayground(h.runtime, h.input)).budgetAvailable).toBe(false);
  expect(await tableSnapshot()).toEqual(before);
});

test("the write-scope preview still stores its binding quote and preview", async () => {
  const before = await rowCounts();
  const quote = await previewModelPlayground(h.runtime, {
    revision: "r",
    input: h.input,
  });
  const after = await rowCounts();
  expect(quote.previewId).toBeTruthy();
  expect(after.model_playground_payment_quotes).toBe(before.model_playground_payment_quotes + 1);
  expect(after.model_playground_previews).toBe(before.model_playground_previews + 1);
  expect(h.runtime.authorize).toHaveBeenCalledWith("create");
});
