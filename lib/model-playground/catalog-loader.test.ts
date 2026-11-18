import { modelAccountDigest } from "@/lib/providers/model/account-scope";
import { MODEL_ID } from "@/lib/providers/model/anthropic/capabilities";
import { probe } from "@/lib/providers/model/anthropic/catalog";
import { catalogFixture, context } from "@/lib/providers/model/anthropic/fixtures.test-support";
import { ModelCatalogCache } from "@/lib/providers/model/catalog-cache";
import { afterEach, expect, it, vi } from "vitest";
import {
  type ModelPlaygroundCatalogLoader,
  modelPlaygroundCatalogRequestSchema,
} from "./catalog-request";
import { composerFixture } from "./composer-fixtures.test-support";
import { validateComposer } from "./composer-state";

// Only the authenticated connection resolver/loader implementation is a fake.
// Adapter, metadata transport, HMAC, cache and composer validation are real; fetch is offline.
afterEach(() => vi.unstubAllGlobals());
it("carries a column workspace through the loader port into probe and isolated cache", async () => {
  const cache = new ModelCatalogCache();
  const fixture = composerFixture();
  const column = fixture.input.columns[1];
  column.modelId = MODEL_ID;
  column.settings.workspaceId = "wrkspc_SyntheticA";
  const network = vi.fn<typeof fetch>(
    async () =>
      new Response(JSON.stringify(catalogFixture()), {
        headers: { "content-type": "application/json" },
      }),
  );
  vi.stubGlobal("fetch", network);
  const load: ModelPlaygroundCatalogLoader = async (request, signal) => {
    request = modelPlaygroundCatalogRequestSchema.parse(request);
    expect(request.connectionId).toBe(column.connectionId);
    const scope = {
      providerId: request.providerId,
      workspaceId: request.workspaceId,
      accountDigest: modelAccountDigest(request.providerId, context().apiKey, request.workspaceId),
      credentialRevision: "b".repeat(64),
    };
    const cached = cache.get(scope);
    if (cached) return cached;
    const result = await probe({
      ...context(),
      accountDigest: scope.accountDigest,
      workspaceId: request.workspaceId,
      signal,
    });
    if (!result.catalog) throw new Error("Missing catalog");
    cache.set(scope, result.catalog);
    return result.catalog;
  };
  const request = {
    providerId: column.providerId,
    connectionId: column.connectionId,
    workspaceId: column.settings.workspaceId,
  };
  const signal = new AbortController().signal;
  const a = await load(request, signal);
  expect(a.workspaceId).toBe(column.settings.workspaceId);
  expect(
    validateComposer({ ...fixture.input, columns: [column] }, [a], fixture.connections),
  ).toEqual([]);
  expect(await load(request, signal)).toEqual(a);
  for (const workspaceId of ["wrkspc_SyntheticB", undefined]) {
    const other = await load({ ...request, workspaceId }, signal);
    expect(other.accountDigest).not.toBe(a.accountDigest);
    expect(
      validateComposer({ ...fixture.input, columns: [column] }, [other], fixture.connections)
        .length,
    ).toBeGreaterThan(0);
  }
  expect(network).toHaveBeenCalledTimes(3);
  expect(
    network.mock.calls.map(([, init]) => new Headers(init?.headers).get("anthropic-workspace-id")),
  ).toEqual(["wrkspc_SyntheticA", "wrkspc_SyntheticB", null]);
});

it.each(["openai", "openrouter", "vercel_ai_gateway"])(
  "rejects a foreign workspace on the %s catalog port",
  (providerId) => {
    expect(
      modelPlaygroundCatalogRequestSchema.safeParse({
        providerId,
        connectionId: composerFixture().input.columns[0].connectionId,
        workspaceId: "wrkspc_SyntheticA",
      }).success,
    ).toBe(false);
  },
);
