import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ resolveKeywordLocation: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/serp/location-service", () => ({
  resolveKeywordLocation: mocks.resolveKeywordLocation,
}));

import type { NewMarketCreateInput } from "./create-input";
import { MarketLocationError, resolveMarketLocation } from "./create-location";

const market = {
  canonicalKey: "ES",
  countryCode: "ES",
  devices: ["desktop"],
  kind: "country" as const,
  languageCode: "es",
  method: { kind: "empty" as const },
  name: "Spain",
  projectId: `prj_${"a".repeat(24)}`,
} satisfies NewMarketCreateInput;

function resolved(overrides: Record<string, unknown> = {}) {
  return {
    degraded: false,
    location: {
      canonicalKey: "ES",
      cityName: null,
      countryCode: "ES",
      displayName: "Spain",
      gl: "es",
      hl: "es",
      id: "loc_es",
      kind: "country",
      languageCode: "es",
      languageLabel: "Spanish",
      primaryGeoCode: null,
      primaryGeoName: "Spain",
      regionCode: null,
      secondaryGeoName: "Spain",
      ...overrides,
    },
    warning: null,
  };
}

describe("resolveMarketLocation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveKeywordLocation.mockResolvedValue(resolved());
  });

  it("resolves a country from its canonical key instead of the structured fields", async () => {
    await expect(resolveMarketLocation("p1", market)).resolves.toMatchObject({ id: "loc_es" });

    expect(mocks.resolveKeywordLocation).toHaveBeenCalledWith({
      projectId: "p1",
      selection: { canonicalKey: "ES", kind: "country" },
    });
  });

  it("rejects a country mismatch from the server-resolved catalog", async () => {
    mocks.resolveKeywordLocation.mockResolvedValue(
      resolved({ canonicalKey: "FR", countryCode: "FR", displayName: "France" }),
    );

    await expect(resolveMarketLocation("p1", market)).rejects.toBeInstanceOf(MarketLocationError);
  });
});
