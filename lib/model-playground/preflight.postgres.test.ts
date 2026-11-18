import { ModelCatalogCache } from "@/lib/providers/model/catalog-cache";
import * as registry from "@/lib/providers/model/registry";
import { afterEach, expect, test, vi } from "vitest";
import { resolveModelConnection } from "./connection-resolution";
import { catalog, entry } from "./contract-fixtures.test-support";
import { launchModelPlayground } from "./launch";
import { launchHarness } from "./launch.test-support";
import { previewModelPlayground } from "./preview";

vi.mock("@/lib/providers/crypto", () => ({
  decryptProviderCredentials: () => ({ apiKey: "synthetic-key" }),
  getPurposeSecretKeys: () => [Buffer.alloc(32, 7)],
}));
vi.mock("@/lib/providers/rate-limit", () => ({
  consumeProviderLimit: async () => ({ success: true }),
}));
const h = launchHarness();
afterEach(() => vi.restoreAllMocks());

test("fresh catalog cache between preview and launch still admits; probes never hold a transaction", async () => {
  const original = h.runtime.db.$transaction.bind(h.runtime.db);
  let active = 0;
  h.runtime.db.$transaction = ((work: Parameters<typeof original>[0], options?: never) =>
    original(async (tx) => {
      active++;
      try {
        return await work(tx);
      } finally {
        active--;
      }
    }, options)) as typeof original;
  let cache = new ModelCatalogCache();
  const probe = vi.fn(async (ctx: { accountDigest: string }) => {
    expect(active).toBe(0);
    return {
      state: "catalog_available" as const,
      catalog: catalog({
        accountDigest: ctx.accountDigest,
        fetchedAt: h.now.toISOString(),
        expiresAt: new Date(+h.now + 300000).toISOString(),
        models: [entry({ capabilityVersion: "synthetic-v1" })],
      }),
    };
  });
  vi.spyOn(registry, "getModelProvider").mockResolvedValue({ ...h.adapter, probe });
  h.runtime.resolve = (db, projectId, request) =>
    resolveModelConnection(db, projectId, request, { cache });
  const quote = await previewModelPlayground(h.runtime, { revision: "r", input: h.input });
  cache = new ModelCatalogCache();
  const outcome = await launchModelPlayground(h.runtime, {
    version: 1,
    revision: "r",
    requestId: crypto.randomUUID(),
    previewId: quote.previewId,
    quoteToken: quote.quoteToken,
    configHash: quote.configHash,
    byokConsent: "non_guaranteed_estimate_v1",
  });
  expect(outcome.kind).toBe("admitted");
  expect(probe).toHaveBeenCalledTimes(2);
  expect(h.calls).toHaveLength(1);
});

test("credential mutation while a probe is waiting is rejected in the quote transaction", async () => {
  vi.spyOn(registry, "getModelProvider").mockResolvedValue({
    ...h.adapter,
    probe: async (ctx) => {
      await h.sql.exec(
        `UPDATE provider_connections SET "credentialsEncrypted"='changed-during-probe'`,
      );
      return {
        state: "catalog_available",
        catalog: catalog({
          accountDigest: ctx.accountDigest,
          fetchedAt: h.now.toISOString(),
          expiresAt: new Date(+h.now + 300000).toISOString(),
        }),
      };
    },
  });
  h.runtime.resolve = (db, projectId, request) =>
    resolveModelConnection(db, projectId, request, { cache: new ModelCatalogCache() });
  await expect(
    previewModelPlayground(h.runtime, { revision: "r", input: h.input }),
  ).rejects.toMatchObject({ reason: "credential_changed" });
  expect((await h.sql.query(`SELECT id FROM model_playground_payment_quotes`)).rows).toHaveLength(
    0,
  );
  expect(h.calls).toHaveLength(0);
});
