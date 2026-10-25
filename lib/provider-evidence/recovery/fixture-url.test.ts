import { afterEach, expect, it, vi } from "vitest";
import { assertRecoveryFixtureUrl } from "./fixture-url.test-support";

afterEach(() => vi.unstubAllEnvs());
it.each([5432, 64621, 64631, 64641])("accepts disposable fixture port %i", (port) => {
  vi.stubEnv("DEPLOYMENT_ENV", "test");
  expect(() =>
    assertRecoveryFixtureUrl(`postgresql://u:p@127.0.0.1:${port}/credits_fixture`),
  ).not.toThrow();
});
it.each([
  "postgresql://u:p@db.example.test:64641/credits_fixture",
  "postgresql://u:p@127.0.0.1:64641/production",
  "postgresql://u:p@127.0.0.1:64641/credits_fixture_other",
])("refuses unsafe fixture %s", (url) => {
  vi.stubEnv("DEPLOYMENT_ENV", "test");
  expect(() => assertRecoveryFixtureUrl(url)).toThrow();
});
it("refuses a non-test environment", () => {
  vi.stubEnv("DEPLOYMENT_ENV", "production");
  expect(() => assertRecoveryFixtureUrl("postgresql://u:p@localhost/credits_fixture")).toThrow();
});
