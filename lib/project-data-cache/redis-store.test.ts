import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  redis: { scan: vi.fn(), get: vi.fn(), ttl: vi.fn(), eval: vi.fn() },
  connect: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/redis/redis", () => ({ getRedisClient: mocks.connect }));

import { listRedisDataCache, removeRedisDataCache, removeStoredRedisCopies } from "./redis-store";

const key = "kr:v2:projectA:connection:shoes:Poland:pl:related:100:0";
const token = (value: string) => Buffer.from(value).toString("base64url");
beforeEach(() => {
  vi.clearAllMocks();
  mocks.connect.mockResolvedValue(mocks.redis);
});
describe("scoped cache management", () => {
  it("never allows another project, catalog, lock or arbitrary Redis key to be removed", async () => {
    for (const invalid of [
      key.replace("projectA", "projectB"),
      `${key}:lock`,
      "sessions:projectA:token",
      "ai-catalog:v1:projectA:c",
    ]) {
      expect(await removeRedisDataCache("projectA", token(invalid))).toBe("invalid");
    }
    expect(mocks.redis.eval).not.toHaveBeenCalled();
  });
  it("retains running results and never deletes the request lock", async () => {
    mocks.redis.eval.mockResolvedValue(-1);
    expect(await removeRedisDataCache("projectA", token(key))).toBe("busy");
    expect(mocks.redis.eval).toHaveBeenCalledWith(expect.stringContaining("exists"), {
      keys: [key, `${key}:lock`],
      arguments: [],
    });
    mocks.redis.eval.mockResolvedValue(1);
    expect(await removeRedisDataCache("projectA", token(key))).toBe("removed");
  });
  it("lists only this project's research entries with real expiry and preserves scan pagination", async () => {
    mocks.redis.scan.mockResolvedValue({
      cursor: "12",
      keys: [key, `${key}:lock`, key.replace("projectA", "projectB"), "ai-catalog:v1:projectA:c"],
    });
    mocks.redis.get.mockResolvedValue(
      JSON.stringify({ fetchedAt: new Date().toISOString(), rows: ["private rows not returned"] }),
    );
    mocks.redis.ttl.mockResolvedValue(3000);
    const result = await listRedisDataCache("projectA", "0", 3600);
    expect(result).toMatchObject({
      available: true,
      cursor: "12",
      entries: [{ keyword: "shoes", source: "related", country: "Poland", language: "pl" }],
    });
    expect(JSON.stringify(result)).not.toContain("private rows");
    expect(mocks.redis.get).toHaveBeenCalledTimes(1);
  });
  it("reports unavailable independently from an empty cache", async () => {
    mocks.connect.mockRejectedValue(new Error("offline"));
    expect(await listRedisDataCache("projectA", "7", null)).toEqual({
      available: false,
      entries: [],
      cursor: "7",
    });
    expect(await removeRedisDataCache("projectA", token(key))).toBe("unavailable");
  });
});

it("lists legacy results by their remaining Redis expiry without inventing fetchedAt", async () => {
  mocks.redis.scan.mockResolvedValue({ cursor: "0", keys: [key] });
  mocks.redis.get.mockResolvedValue(JSON.stringify({ rows: [] }));
  mocks.redis.ttl.mockResolvedValue(120);
  const before = Date.now();
  const page = await listRedisDataCache("projectA", "0", 3600);
  expect(page.entries).toHaveLength(1);
  expect(Date.parse(page.entries[0].expiresAt)).toBeGreaterThanOrEqual(before + 120000);
});
it("invalidates only the selected domain market and scope with one atomic lock preflight", async () => {
  const selected = "do:v1:projectA:dataforseo:overview:example.com:root:2616:pl";
  const history = selected.replace(":overview:", ":history:");
  mocks.redis.scan.mockResolvedValue({
    cursor: "0",
    keys: [
      selected,
      history,
      `${history}:lock`,
      selected.replace(":2616:pl", ":2840:en"),
      selected.replace(":root:", ":subdomain:"),
    ],
  });
  mocks.redis.eval.mockResolvedValue(-1);
  expect(
    await removeStoredRedisCopies("projectA", {
      module: "domain_overview",
      target: "example.com",
      provider: "dataforseo",
      scope: "root",
      locationCode: 2616,
      languageCode: "pl",
    }),
  ).toBe("busy");
  expect(mocks.redis.eval).toHaveBeenCalledOnce();
  expect(mocks.redis.eval).toHaveBeenCalledWith(expect.stringContaining("for i = n + 1"), {
    keys: [selected, history, `${selected}:lock`, `${history}:lock`],
    arguments: [],
  });
});
it("retains other backlink scopes, subdomain flags and modes", async () => {
  const selected = "bl:v3:projectA:dataforseo:example.com:site:1:as_is:100";
  mocks.redis.scan.mockResolvedValue({
    cursor: "0",
    keys: [
      selected,
      selected.replace(":100", ":300"),
      selected.replace(":site:", ":page:"),
      selected.replace(":1:", ":0:"),
      selected.replace(":as_is:", ":one_per_domain:"),
    ],
  });
  mocks.redis.eval.mockResolvedValue(2);
  expect(
    await removeStoredRedisCopies("projectA", {
      module: "backlinks",
      target: "example.com",
      provider: "dataforseo",
      scope: "site",
      includeSubdomains: true,
      mode: "as_is",
    }),
  ).toBe("removed");
  expect(mocks.redis.eval).toHaveBeenCalledWith(expect.any(String), {
    keys: [
      selected,
      selected.replace(":100", ":300"),
      `${selected}:lock`,
      `${selected.replace(":100", ":300")}:lock`,
    ],
    arguments: [],
  });
});
it("does not delete any copies when a later scan fails", async () => {
  mocks.redis.scan
    .mockResolvedValueOnce({
      cursor: "7",
      keys: ["do:v1:projectA:dataforseo:overview:example.com:root:2616:pl"],
    })
    .mockRejectedValueOnce(new Error("offline"));
  expect(
    await removeStoredRedisCopies("projectA", {
      module: "domain_overview",
      target: "example.com",
      provider: "dataforseo",
      scope: "root",
      locationCode: 2616,
      languageCode: "pl",
    }),
  ).toBe("unavailable");
  expect(mocks.redis.eval).not.toHaveBeenCalled();
});

it("invalidates retained mixed-case language copies against normalized stored identity", async () => {
  const key = "do:v1:projectA:dataforseo:overview:example.com:root:2840:zh-TW";
  mocks.redis.scan.mockResolvedValue({ cursor: "0", keys: [key] });
  mocks.redis.eval.mockResolvedValue(1);
  expect(
    await removeStoredRedisCopies("projectA", {
      module: "domain_overview",
      target: "example.com",
      provider: "dataforseo",
      scope: "root",
      locationCode: 2840,
      languageCode: "zh-tw",
    }),
  ).toBe("removed");
  expect(mocks.redis.eval).toHaveBeenCalledWith(expect.any(String), {
    keys: [key, `${key}:lock`],
    arguments: [],
  });
});

it("lists and removes engine answers within the owning project's cache", async () => {
  const engineKey = `ai:v3-engines:projectA:connection:prompt_explorer:${"a".repeat(64)}`;
  mocks.redis.scan.mockResolvedValue({ cursor: "0", keys: [engineKey] });
  mocks.redis.get.mockResolvedValue(
    JSON.stringify({ fetchedAt: new Date().toISOString(), reportId: "agr_engine" }),
  );
  mocks.redis.ttl.mockResolvedValue(3000);
  const page = await listRedisDataCache("projectA", "0", 3600);
  expect(page.entries).toEqual([
    expect.objectContaining({ module: "prompt_explorer", reportRef: "agr_engine" }),
  ]);
  mocks.redis.eval.mockResolvedValue(1);
  expect(await removeRedisDataCache("projectA", token(engineKey))).toBe("removed");
  expect(await removeRedisDataCache("projectB", token(engineKey))).toBe("invalid");
});
