import { resetRateLimitStateForTests } from "@/lib/api/ratelimit";
import { clearProviderRateLimitState } from "@/lib/providers/rate-limit";
import { ProviderChainError, runCheckWithFallback } from "@/lib/rank-check/fallback";
import type { SerpRankLocation } from "@/lib/serp/location";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { dataForSeoProvider } from "./dataforseo";

const LOCATION: SerpRankLocation = {
  gl: "us",
  hl: "en",
  primaryGeoCode: null,
  primaryGeoName: "United States",
  secondaryGeoName: "United States",
};

describe("DataForSEO fallback attempts", () => {
  beforeEach(() => {
    resetRateLimitStateForTests();
    clearProviderRateLimitState();
    process.env.BISIBILITY_PROVIDER_RATE_LIMIT_DISABLED = "1";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    process.env.BISIBILITY_PROVIDER_RATE_LIMIT_DISABLED = "";
  });

  it("keeps a task billing message in serializable attempt JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            status_code: 20000,
            status_message: "Ok.",
            tasks: [{ status_code: 40210, status_message: "Insufficient funds" }],
          }),
          { status: 200 },
        ),
      ),
    );

    const error = await runCheckWithFallback({
      connections: [
        { provider: "dataforseo", credentials: { login: "login", password: "secret" } },
      ],
      keyword: {
        device: "desktop",
        domain: "example.com",
        id: "keyword_1",
        location: LOCATION,
        text: "rank tracker",
      },
      resolveProvider: () => dataForSeoProvider,
      schedule: { frequency: "manual" },
    }).catch((cause: unknown) => cause);

    expect(error).toBeInstanceOf(ProviderChainError);
    expect(error).toMatchObject({ dominantCode: "provider_billing" });
    expect(
      JSON.parse(
        JSON.stringify(
          (error as ProviderChainError).attempts.map(({ message, provider }) => ({
            message,
            provider,
          })),
        ),
      ),
    ).toEqual([{ message: "Insufficient funds", provider: "dataforseo" }]);
  });
});
