import { expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ test: vi.fn(), decrypt: vi.fn(), cache: vi.fn() }));
vi.mock("@/lib/providers/crypto", () => ({ decryptProviderCredentials: mocks.decrypt }));
vi.mock("@/lib/providers/registry", () => ({
  getSerpProvider: () => ({ testConnection: mocks.test }),
}));
vi.mock("@/lib/provider-lookups/cache", () => ({
  positiveTtl: () => 900,
  withProviderLookupCache: mocks.cache,
}));

import { loadProviderAvailability } from "./provider-availability";

it("never probes an inactive saved key for a hosted connection, including a forced refresh", async () => {
  const connection = {
    credentialSource: "hosted" as const,
    credentialsEncrypted: "retained",
    id: "connection",
    kind: "serp",
    provider: "dataforseo",
    status: "connected",
  };
  expect(await loadProviderAvailability([connection], connection.id)).toEqual(
    new Map([[connection.id, null]]),
  );
  expect(mocks.decrypt).not.toHaveBeenCalled();
  expect(mocks.test).not.toHaveBeenCalled();
  expect(mocks.cache).not.toHaveBeenCalled();
});
