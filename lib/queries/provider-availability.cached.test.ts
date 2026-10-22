import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  read: vi.fn(),
  load: vi.fn(),
  provider: vi.fn(),
  decrypt: vi.fn(),
}));
vi.mock("@/lib/provider-lookups/cache", () => ({
  readProviderLookupCache: mocks.read,
  withProviderLookupCache: mocks.load,
  positiveTtl: (_raw: unknown, fallback: number) => fallback,
}));
vi.mock("@/lib/providers/registry", () => ({ getSerpProvider: mocks.provider }));
vi.mock("@/lib/providers/crypto", () => ({ decryptProviderCredentials: mocks.decrypt }));

import { readCachedProviderAvailability } from "./provider-availability";

const at = Date.parse("2026-10-21T17:00:00Z");
const connection = {
  id: "internal",
  provider: "serpapi",
  updatedAt: new Date("2026-10-01T00:00:00Z"),
  credentialSource: "own",
  status: "connected",
  hasStoredCredentials: true,
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.read.mockResolvedValue({
    status: "available",
    amount: 239,
    unit: "searches",
    checkedAt: "2026-10-21T16:59:00Z",
  });
});
afterEach(() => {
  expect(mocks.load).not.toHaveBeenCalled();
  expect(mocks.provider).not.toHaveBeenCalled();
  expect(mocks.decrypt).not.toHaveBeenCalled();
});
it("reads only the exact connection-version cached observation", async () => {
  const result = await readCachedProviderAvailability(connection, at);
  expect(mocks.read).toHaveBeenCalledWith(
    "provider-availability:v1:internal:2026-10-01T00:00:00.000Z",
  );
  expect(result).toMatchObject({
    outcome: "ready",
    value: { text: "239", unit: "searches", certainty: "measured" },
    expiresAt: "2026-10-21T17:14:00.000Z",
  });
});
it.each([
  null,
  { status: "available", amount: -1, unit: "searches", checkedAt: "2026-10-21T16:59:00Z" },
  { status: "available", amount: 1.5, unit: "searches", checkedAt: "2026-10-21T16:59:00Z" },
  {
    status: "available",
    amount: Number.MAX_SAFE_INTEGER + 1,
    unit: "searches",
    checkedAt: "2026-10-21T16:59:00Z",
  },
  { status: "available", amount: 1, unit: "usd", checkedAt: "2026-10-21T16:59:00Z" },
  { status: "available", amount: 1, unit: "searches", checkedAt: "2026-10-21T17:01:00Z" },
  { status: "available", amount: 1, unit: "searches", checkedAt: "2026-10-21T16:00:00Z" },
])("rejects a missing or invalid cached balance without loading: %j", async (value) => {
  mocks.read.mockResolvedValue(value);
  expect((await readCachedProviderAvailability(connection, at)).outcome).toBe("unavailable");
});
it("rejects an invalid connection version before even reading cache", async () => {
  expect(
    (await readCachedProviderAvailability({ ...connection, updatedAt: new Date("invalid") }, at))
      .outcome,
  ).toBe("unavailable");
  expect(mocks.read).not.toHaveBeenCalled();
});
