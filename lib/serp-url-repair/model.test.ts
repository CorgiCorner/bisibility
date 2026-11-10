import { describe, expect, it } from "vitest";
import { destinationUrl, repairedUrl, storedUrlRepair, urlRepairTargetSchema } from "./model";
import { repairedFeatures } from "./presentation";

const original = "https://google.com/goto?url=saved";
const state = {
  version: 1,
  workflowId: "job",
  runId: "run",
  status: "completed",
  updatedAt: "2026-11-09T10:00:00Z",
  mappings: { [original]: "https://example.com/page" },
  resolved: 1,
  unresolved: 0,
};
describe("saved URL display enrichment", () => {
  it("only overlays Google redirects and rejects unsafe destinations", () => {
    expect(repairedUrl(original, state)).toBe("https://example.com/page");
    expect(
      repairedUrl("https://example.org/original", {
        ...state,
        mappings: { "https://example.org/original": "https://another.test" },
      }),
    ).toBe("https://example.org/original");
    for (const url of ["javascript:alert(1)", "https://user:pass@example.com/", original]) {
      expect(destinationUrl(url)).toBeNull();
      expect(repairedUrl(original, { ...state, mappings: { [original]: url } })).toBe(original);
    }
  });
  it("leaves source features intact while enriching their displayed URLs", () => {
    const features = {
      aiOverview: { present: true, paragraphs: [], sources: [{ title: "Source", url: original }] },
      localPack: { present: false, places: [] },
      richFeatures: [
        {
          kind: "shopping" as const,
          nativeTypes: ["shopping_results"],
          items: [{ title: "Product", url: original, price: "$12" }],
        },
      ],
    };
    const result = repairedFeatures(features, state);
    expect(result.richFeatures?.[0].items[0].url).toBe("https://example.com/page");
    expect(result.aiOverview.sources[0].url).toBe("https://example.com/page");
    expect(features.aiOverview.sources[0].url).toBe(original);
    expect(result.richFeatures?.[0].items[0].price).toBe("$12");
  });
  it("requires a specific stored source and rejects client-supplied URLs or actors", () => {
    expect(
      urlRepairTargetSchema.safeParse({ kind: "check", checkId: "check_abcdefgh", url: original })
        .success,
    ).toBe(false);
    expect(
      urlRepairTargetSchema.safeParse({
        kind: "comparison",
        runId: "arbitrary",
        provider: "serpapi",
      }).success,
    ).toBe(false);
    expect(storedUrlRepair({ ...state, resolved: -1 })).toBeNull();
  });
});
