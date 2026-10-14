import { afterEach, describe, expect, it, vi } from "vitest";
import { SYNTHETIC_SERP_ADAPTER_VERSION, syntheticSerpAdapterActive } from "./synthetic-mode";
import { syntheticSerpObservation } from "./synthetic-observation";

const input = {
  keyword: "fixture",
  device: "desktop" as const,
  domain: "example.test",
  depth: 100 as const,
  stopOnMatch: true,
  location: {
    gl: "us",
    hl: "en",
    primaryGeoCode: null,
    primaryGeoName: "United States",
    secondaryGeoName: "United States",
  },
};
afterEach(() => vi.unstubAllEnvs());
describe("active synthetic transport evidence", () => {
  it.each(["dataforseo", "serpapi"])(
    "retains actual existing provider ID %s without real completeness",
    (provider) => {
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("BISIBILITY_FAKE_PROVIDER", "1");
      const observation = syntheticSerpObservation(provider, input, {
        checkedAt: new Date("2026-06-19T00:00:00Z"),
        position: 7,
        rankingUrl: "https://example.test/result",
      });
      expect(observation.provider).toBe(provider);
      expect(observation.completeness).toBe("unknown");
      expect(observation.effectiveScope).toBeNull();
      expect(observation.requestPolicy.findTargetsIn).toBeNull();
      expect(observation.requestPolicy.evidence).toEqual({
        version: 1,
        adapterVersion: SYNTHETIC_SERP_ADAPTER_VERSION,
        observedAt: null,
        requestedAt: null,
        completeThrough: { organic_result: null, local_pack: null, ai_overview: null },
      });
    },
  );
  it("never enables an unknown provider or production local-sequence", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("BISIBILITY_FAKE_PROVIDER", "1");
    expect(syntheticSerpAdapterActive("invented")).toBe(false);
    expect(syntheticSerpAdapterActive("local-sequence")).toBe(false);
  });
  it("keeps real transports out of the synthetic branch", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("BISIBILITY_FAKE_PROVIDER", "0");
    expect(syntheticSerpAdapterActive("dataforseo")).toBe(false);
  });
});
