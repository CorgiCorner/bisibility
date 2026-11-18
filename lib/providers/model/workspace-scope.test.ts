import { createModelPlaygroundRunSchema } from "@/lib/model-playground/schema";
import { expect, it } from "vitest";
import { catalogFromPage } from "./anthropic/catalog";
import { catalogFixture, input } from "./anthropic/fixtures.test-support";
import { ModelCatalogCache } from "./catalog-cache";

// Synthetic scopes, never a provider account.
it("never shares a cached scoped catalog with another workspace or omission", () => {
  const cache = new ModelCatalogCache();
  const scope = {
    providerId: "anthropic" as const,
    accountDigest: "a".repeat(64),
    credentialRevision: "b".repeat(64),
    workspaceId: "wrkspc_SyntheticA",
  };
  const catalog = {
    ...catalogFromPage(catalogFixture(), scope.accountDigest),
    workspaceId: scope.workspaceId,
  };
  cache.set(scope, catalog);
  expect(cache.get(scope)).toEqual(catalog);
  expect(cache.get({ ...scope, workspaceId: "wrkspc_SyntheticB" })).toBeNull();
  const { workspaceId: _workspace, ...unscoped } = scope;
  expect(cache.get(unscoped)).toBeNull();
  expect(() => cache.set({ ...scope, workspaceId: "wrkspc_SyntheticB" }, catalog)).toThrow();
});
it("only admits a column against the exact workspace catalog scope", () => {
  const request = input();
  const catalog = catalogFromPage(catalogFixture(), "a".repeat(64));
  const draft = {
    version: 1 as const,
    prompt: request.prompt,
    responseLanguage: "en",
    columns: [request.column],
  };
  Object.assign(draft.columns[0].settings, { workspaceId: "wrkspc_SyntheticA" });
  expect(createModelPlaygroundRunSchema([catalog], new Date()).safeParse(draft).success).toBe(
    false,
  );
  expect(
    createModelPlaygroundRunSchema(
      [{ ...catalog, workspaceId: "wrkspc_SyntheticA" }],
      new Date(),
    ).safeParse(draft).success,
  ).toBe(true);
});
