import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { consumeProviderLimit, providerAccountKey, providerRateLimitPolicy } from "./rate-limit";

const providers = ["openai", "anthropic", "openrouter", "vercel_ai_gateway"];

describe("native model account limits", () => {
  beforeEach(() => {
    vi.stubEnv("REDIS_URL", "");
    vi.stubEnv("BISIBILITY_PROVIDER_RATE_LIMIT_DISABLED", "");
  });
  afterEach(() => vi.unstubAllEnvs());

  it.each(providers)("shares one hashed %s key bucket across projects", async (provider) => {
    const creds = { apiKey: `synthetic-${provider}-shared-key` };
    const first = providerAccountKey(provider, creds, { projectId: "project-one" });
    const second = providerAccountKey(provider, creds, { projectId: "project-two" });
    expect(first).toBe(second);
    expect(first.startsWith(`${provider}:`)).toBe(true);
    expect(first.slice(provider.length + 1)).toMatch(/^[a-f0-9]{16}$/);
    expect(first).not.toContain(creds.apiKey);
    expect(providerAccountKey(provider, { apiKey: "different-key" })).not.toBe(first);
    expect(providerRateLimitPolicy(provider)).toEqual({ perMinute: 60, windowSeconds: 60 });
    for (let index = 0; index < 60; index++) {
      expect(
        (await consumeProviderLimit(provider, creds, { projectId: "project-one" })).success,
      ).toBe(true);
    }
    expect(
      (await consumeProviderLimit(provider, creds, { projectId: "project-two" })).success,
    ).toBe(false);
  });
});
