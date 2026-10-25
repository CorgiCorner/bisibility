import { consume } from "@/lib/api/ratelimit";
import { consumeProviderLimit, providerAccountKey } from "@/lib/providers/rate-limit";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { account } from "./fixtures.test-support";
import { consumeHistoryLimit } from "./limiter";

vi.mock("@/lib/api/ratelimit", () => ({ consume: vi.fn() }));
vi.mock("@/lib/providers/rate-limit", async (original) => ({
  ...(await original<typeof import("@/lib/providers/rate-limit")>()),
  consumeProviderLimit: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(consumeProviderLimit).mockResolvedValue({
    success: true,
    remaining: 100,
    resetAt: Date.now() + 60000,
    accountKey: "account",
    cooling: false,
  });
  vi.mocked(consume).mockResolvedValue({
    success: true,
    remaining: 9,
    limit: 10,
    resetAt: Date.now() + 60000,
  });
});

describe("shared original-account limits", () => {
  it("uses the existing provider bucket plus a shared 10/min ID List bucket", async () => {
    expect(await consumeHistoryLimit(account, true)).toBeNull();
    expect(consumeProviderLimit).toHaveBeenCalledWith("dataforseo", account);
    expect(consume).toHaveBeenCalledWith({
      bucketKey: providerAccountKey("dataforseo", account),
      prefix: "bisibility:provider:serp-id-list",
      limit: 10,
      windowSeconds: 60,
      requireShared: true,
    });
    expect(providerAccountKey("dataforseo", { ...account, password: "rotated" })).toBe(
      providerAccountKey("dataforseo", account),
    );
    expect(providerAccountKey("dataforseo", { ...account, login: "different" })).not.toBe(
      providerAccountKey("dataforseo", account),
    );
  });

  it("Task GET shares the provider bucket without consuming the ID List quota", async () => {
    expect(await consumeHistoryLimit(account, false)).toBeNull();
    expect(consumeProviderLimit).toHaveBeenCalledOnce();
    expect(consume).not.toHaveBeenCalled();
  });

  it("returns backoff on a shared or ID List limit", async () => {
    vi.mocked(consumeProviderLimit).mockResolvedValueOnce({
      success: false,
      remaining: 0,
      resetAt: Date.now() + 10000,
      accountKey: "account",
      cooling: true,
    });
    expect(await consumeHistoryLimit(account, true)).toMatchObject({
      kind: "rate_limited",
      reason: "shared_account_limit",
      retryable: true,
    });
    expect(consume).not.toHaveBeenCalled();
    vi.mocked(consume).mockResolvedValueOnce({
      success: false,
      remaining: 0,
      resetAt: Date.now() + 10000,
      limit: 10,
    });
    expect(await consumeHistoryLimit(account, true)).toMatchObject({
      kind: "rate_limited",
      reason: "id_list_account_limit",
      retryable: true,
    });
  });
});
