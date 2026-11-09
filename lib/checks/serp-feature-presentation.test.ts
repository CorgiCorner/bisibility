import { describe, expect, it } from "vitest";
import { serpFeaturePresentation } from "./serp-feature-presentation";

describe("retained SERP features", () => {
  it("keeps local pack slots separate from organic positions and rejects unsafe links", () => {
    const value = serpFeaturePresentation([
      {
        resultKind: "local_pack",
        businessName: "Clinic",
        positionInBlock: 2,
        url: "javascript:alert(1)",
      },
      { resultKind: "organic_result", title: "Website", positionInBlock: 1 },
      {
        resultKind: "ai_overview",
        rawFragment: { text_blocks: [{ snippet: "Saved overview" }], page_token: "secret" },
      },
    ]);
    expect(value.localPack).toEqual({
      present: true,
      places: [{ name: "Clinic", position: 2, url: null }],
    });
    expect(value.aiOverview.paragraphs).toEqual(["Saved overview"]);
    expect(JSON.stringify(value)).not.toContain("secret");
  });
  it("preserves presence without pretending the content was retained", () => {
    expect(serpFeaturePresentation([], ["ai overview", "local pack"])).toEqual({
      aiOverview: { present: true, paragraphs: [], sources: [] },
      localPack: { present: true, places: [] },
    });
    expect(serpFeaturePresentation([]).localPack.present).toBe(false);
  });
});

it("keeps recorded place descriptions and ratings without inventing missing values", () => {
  const result = serpFeaturePresentation([
    {
      resultKind: "local_pack",
      businessName: "Hebe",
      url: "https://example.com",
      mapsUrl: "https://maps.google.com/?cid=123",
      rawFragment: { description: "Złota 59\nClosed", rating: { value: 4.2, votes_count: 268 } },
    },
    { resultKind: "local_pack", businessName: "Another" },
  ]);
  expect(result.localPack.places[0]).toMatchObject({
    description: "Złota 59\nClosed",
    rating: 4.2,
    reviewCount: 268,
    url: "https://maps.google.com/?cid=123",
  });
  expect(result.localPack.places[1]).not.toHaveProperty("rating");
});
