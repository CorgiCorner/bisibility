import { afterEach, expect, it, vi } from "vitest";
import { providerUsageOpsKey } from "./ops-identity";

afterEach(() => vi.unstubAllEnvs());
it("isolates otherwise identical incidents by instance and accounting namespace", () => {
  vi.stubEnv("SITE_URL", "https://example.com");
  const prod = providerUsageOpsKey("provider_usage_unconfirmed", "default");
  expect(providerUsageOpsKey("provider_usage_unconfirmed", "different")).not.toBe(prod);
  vi.stubEnv("SITE_URL", "https://demo.example.com");
  expect(providerUsageOpsKey("provider_usage_unconfirmed", "default")).not.toBe(prod);
  expect(prod).not.toContain("example.com");
});
