import { describe, expect, it } from "vitest";
import {
  completedCheckAttempts,
  completedViaFallback,
  deriveCheckAttemptSummary,
  parseCheckAttempts,
} from "./attempts";

describe("check attempt parsing", () => {
  it("maps the stored fallback shape and infers bounded outcomes", () => {
    expect(
      parseCheckAttempts([
        { message: "Provider rate limited (429)", provider: "dataforseo" },
        {
          cost_cents: "0.25",
          degraded_to_country: true,
          duration_ms: 45,
          message: "Credentials unavailable",
          provider: "custom_serp",
        },
      ]),
    ).toEqual([
      {
        costCents: null,
        degradedToCountry: false,
        detail: "Provider rate limited (429)",
        durationMs: null,
        outcome: "rate_limited",
        provider: "dataforseo",
        providerLabel: "DataForSEO",
      },
      {
        costCents: 0.25,
        degradedToCountry: true,
        detail: "Credentials unavailable",
        durationMs: 45,
        outcome: "credentials_unavailable",
        provider: "custom_serp",
        providerLabel: "Custom Serp",
      },
    ]);
  });

  it("tolerates malformed and partial JSON", () => {
    expect(parseCheckAttempts(null)).toEqual([]);
    expect(parseCheckAttempts([null, "bad", {}])).toEqual([
      {
        costCents: null,
        degradedToCountry: false,
        detail: null,
        durationMs: null,
        outcome: "provider_failed",
        provider: "unknown",
        providerLabel: "Unknown",
      },
    ]);
  });

  it("adds the persisted final provider and derives fallback use", () => {
    const attempts = completedCheckAttempts(
      [{ message: "Provider failed", provider: "dataforseo" }],
      "serpapi",
    );

    const finalAttempt = attempts.at(-1);
    expect(finalAttempt).toMatchObject({ outcome: "ok", provider: "serpapi" });
    if (!finalAttempt) throw new Error("Expected a final attempt.");
    expect(completedViaFallback(attempts, "serpapi")).toBe(true);
    expect(completedViaFallback(completedCheckAttempts(null, "serpapi"), "serpapi")).toBe(false);
    expect(
      completedViaFallback(
        [
          { ...finalAttempt, provider: "dataforseo" },
          { ...finalAttempt, provider: "serpapi" },
        ],
        "serpapi",
      ),
    ).toBe(true);
  });

  it("derives denormalized summaries for migration backfills and writes", () => {
    expect(
      deriveCheckAttemptSummary(
        [
          {
            degraded_to_country: true,
            message: "Provider rate limited (429)",
            provider: "dataforseo",
          },
        ],
        "serpapi",
        "completed",
      ),
    ).toEqual({
      attemptCount: 2,
      degradedToCountry: true,
      viaFallback: true,
    });
    expect(
      deriveCheckAttemptSummary([{ outcome: "ok", provider: "serpapi" }], "serpapi", "completed"),
    ).toEqual({
      attemptCount: 1,
      degradedToCountry: false,
      viaFallback: false,
    });
    expect(
      deriveCheckAttemptSummary(
        [{ message: "Provider failed", provider: "serpapi" }],
        "serpapi",
        "failed",
      ),
    ).toEqual({
      attemptCount: 1,
      degradedToCountry: false,
      viaFallback: false,
    });
  });
});
