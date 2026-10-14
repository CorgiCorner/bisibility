import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/providers/registry", () => {
  throw new Error("Presentation must not initialize server provider implementations");
});

describe("client-safe provider labels", () => {
  it("reads existing labels and attempt presentation without initializing providers", async () => {
    const { providerLabel, completedCheckAttempts } = await import("./attempts");
    expect(providerLabel("dataforseo")).toBe("DataForSEO");
    expect(providerLabel("serpapi")).toBe("SerpApi");
    expect(providerLabel("gsc")).toBe("Google Search Console");
    expect(providerLabel("ga4")).toBe("Google Analytics 4");
    expect(providerLabel("plausible")).toBe("Plausible");
    expect(providerLabel("custom_serp")).toBe("Custom Serp");
    expect(providerLabel("")).toBe("Unknown");
    expect(completedCheckAttempts(null, "serpapi")[0]?.providerLabel).toBe("SerpApi");
  });
});
