import { describe, expect, it } from "vitest";
import { serpFeaturePresentation } from "./serp-feature-presentation";
import { richSerpFeatures } from "./serp-rich-features";

describe("retained rich result previews", () => {
  it("projects company, images, products and questions from a native page without leaking tokens", () => {
    const value = richSerpFeatures([
      {
        search_metadata: { api_key: "private" },
        knowledge_graph: {
          title: "A company",
          description: "About this business",
          website: "example.com",
          attributes: [{ name: "Founded", value: "2020" }],
          secret: "private",
        },
        inline_images: [
          {
            title: "An image",
            thumbnail: "https://images.example.com/a.jpg",
            link: "https://example.com/image",
          },
        ],
        shopping_results: [
          {
            title: "Coffee",
            price: "$12.50",
            source: "A store",
            rating: 4.7,
            reviews: 12,
            thumbnail: "https://example.com/coffee.jpg",
            link: "https://example.com/shop",
          },
        ],
        related_questions: [
          { question: "What is coffee?", snippet: "An answer", link: "https://example.com/answer" },
        ],
        organic_results: [{ position: 1, title: "Organic result" }],
      },
    ]);
    expect(value.map((x) => x.kind)).toEqual(
      expect.arrayContaining(["knowledgePanel", "images", "shopping", "peopleAlsoAsk"]),
    );
    expect(value.find((x) => x.kind === "shopping")?.items[0]).toMatchObject({
      title: "Coffee",
      price: "$12.50",
      rating: 4.7,
      reviewCount: 12,
    });
    expect(value.find((x) => x.kind === "knowledgePanel")?.items[0].facts).toEqual([
      { label: "Founded", value: "2020" },
    ]);
    expect(JSON.stringify(value)).not.toMatch(/private|search_metadata|Organic result/);
  });
  it("retains nested product ratings", () => {
    const features = richSerpFeatures({
      shopping_results: [{ title: "Product", rating: { value: 4.5, votes_count: 20 } }],
    });
    expect(features[0].items[0]).toMatchObject({ rating: 4.5, reviewCount: 20 });
  });
  it("groups native blocks without mixing their ranks into organic results", () => {
    const value = richSerpFeatures({
      tasks: [
        {
          result: [
            {
              items: [
                { type: "organic", title: "Ignore" },
                {
                  type: "images",
                  rank_absolute: 2,
                  items: [{ title: "Image", image_url: "https://example.com/image.jpg" }],
                },
                { type: "shopping", items: [{ title: "Product", price: { current: "$20" } }] },
                { type: "knowledge_graph", title: "Business", description: "Details" },
              ],
            },
          ],
        },
      ],
    });
    expect(value).toHaveLength(3);
    expect(value.find((x) => x.kind === "images")?.items).toEqual([
      { title: "Image", imageUrl: "https://example.com/image.jpg" },
    ]);
    expect(JSON.stringify(value)).not.toContain("rank_absolute");
  });
  it("retains unsupported feature names but does not invent content", () => {
    expect(richSerpFeatures(undefined, ["jobs", "ai overview", "local pack"])).toEqual([
      { kind: "other", nativeTypes: ["jobs"], items: [] },
    ]);
  });
  it("rejects script, credential and token-bearing links; bounds provider content", () => {
    const value = richSerpFeatures([
      {
        inline_images: Array.from({ length: 100 }, (_, i) => ({
          title: String(i),
          thumbnail: "javascript:alert(1)",
          link: "https://example.com/?page_token=private",
        })),
        shopping_results: [
          {
            title: "Unsafe",
            link: "https://user:pass@example.com/",
            thumbnail: "data:image/svg+xml,<svg/>",
          },
        ],
      },
    ]);
    expect(value[0].items).toHaveLength(30);
    expect(value[0].items[0]).toEqual({ title: "0" });
    expect(value[1].items[0]).toEqual({ title: "Unsafe" });
  });
  it("leaves older snapshots without a native response valid", () => {
    expect(serpFeaturePresentation([], ["shopping results"]).richFeatures).toEqual([
      { kind: "shopping", nativeTypes: ["shopping_results"], items: [] },
    ]);
    expect(serpFeaturePresentation([])).not.toHaveProperty("richFeatures");
  });
});

it("uses a returned formatted price and preserves numeric native prices without guessing currency", () => {
  const value = richSerpFeatures({
    tasks: [
      {
        result: [
          {
            items: [
              {
                type: "shopping",
                items: [
                  {
                    title: "Formatted",
                    price: { current: 19.5, currency: "PLN", displayed_price: "19,50 zł" },
                  },
                  { title: "No currency", price: { current: 12 } },
                ],
              },
            ],
          },
        ],
      },
    ],
  });
  expect(value[0].items[0]).toMatchObject({
    price: "19,50 zł",
    priceAmount: 19.5,
    priceCurrency: "PLN",
  });
  expect(value[0].items[1]).toEqual({ title: "No currency", priceAmount: 12 });
});
