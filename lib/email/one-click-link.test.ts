import { afterEach, expect, it, vi } from "vitest";
import { oneClickUnsubscribeUrl } from "./one-click-link";

afterEach(() => vi.unstubAllEnvs());
it("uses the regional app host for provider POSTs from hosted apex links", () => {
  vi.stubEnv("DEPLOYMENT_MODE", "cloud");
  expect(
    oneClickUnsubscribeUrl("https://bisibility.com/email/unsubscribe?token=opaque", "marketing"),
  ).toBe("https://eu.bisibility.com/api/email/unsubscribe/one-click?stream=marketing&token=opaque");
});
it("preserves self-host and preview origins", () => {
  vi.stubEnv("DEPLOYMENT_MODE", "self-hosted");
  expect(
    oneClickUnsubscribeUrl("https://bisibility.com/email/unsubscribe?token=opaque", "marketing"),
  ).toContain("https://bisibility.com/");
  vi.stubEnv("DEPLOYMENT_MODE", "cloud");
  expect(
    oneClickUnsubscribeUrl(
      "https://preview.example.com/email/unsubscribe?token=opaque",
      "marketing",
    ),
  ).toContain("https://preview.example.com/");
});
