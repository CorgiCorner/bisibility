import { beforeEach, expect, it, vi } from "vitest";

const config = vi.hoisted(() => ({
  bucket: { limit: 2, requireShared: false } as { limit: number; requireShared: boolean } | null,
}));
vi.mock("./rate-limit-extension", () => ({
  readAccountRateBucket: async (ownerId: string) =>
    config.bucket && { ...config.bucket, bucketKey: `account:${ownerId}` },
}));

import { checkRateLimit, resetRateLimitStateForTests } from "./ratelimit";

const request = new Request("https://example.com/api/v1/projects");
beforeEach(() => {
  resetRateLimitStateForTests();
  vi.stubEnv("REDIS_URL", "");
  vi.stubEnv("BISIBILITY_API_KEY_RATE_LIMIT_PER_MINUTE", "10");
  config.bucket = { limit: 2, requireShared: false };
});
it("shares an account bucket across keys and credential kinds", async () => {
  expect(
    (await checkRateLimit(request, { kind: "api-key", id: "a", ownerId: "owner" })).success,
  ).toBe(true);
  expect(
    (await checkRateLimit(request, { kind: "personal-token", id: "b", ownerId: "owner" })).success,
  ).toBe(true);
  const blocked = await checkRateLimit(request, { kind: "api-key", id: "c", ownerId: "owner" });
  expect(blocked.success).toBe(false);
  expect(blocked.headers.get("Retry-After")).toBeTruthy();
  expect(
    (await checkRateLimit(request, { kind: "api-key", id: "d", ownerId: "other" })).success,
  ).toBe(true);
});
it("keeps the credential ceiling alongside the account ceiling", async () => {
  vi.stubEnv("BISIBILITY_API_KEY_RATE_LIMIT_PER_MINUTE", "1");
  const identity = { kind: "api-key", id: "a", ownerId: "owner" } as const;
  expect((await checkRateLimit(request, identity)).success).toBe(true);
  expect((await checkRateLimit(request, identity)).success).toBe(false);
});
it("fails closed when the account requires Redis and leaves anonymous requests unchanged", async () => {
  config.bucket = { limit: 2, requireShared: true };
  await expect(
    checkRateLimit(request, { kind: "api-key", id: "a", ownerId: "owner" }),
  ).rejects.toThrow("Shared Redis");
  await expect(checkRateLimit(request, { kind: "anonymous" })).resolves.toMatchObject({
    success: true,
  });
});
