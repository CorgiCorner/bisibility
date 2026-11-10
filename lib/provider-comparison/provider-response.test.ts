import { expect, it } from "vitest";
import { redactProviderResponse } from "./provider-response";
import { publicComparisonResult, retainComparisonCapture } from "./retained-result";

it("retains provider content while removing credentials and reusable URLs", () => {
  const raw = {
    api_key: "secret",
    clientSecret: "secret",
    headers: { Authorization: "secret" },
    results: [{ title: "A result", url: "https://example.com/?q=coffee&api_key=secret" }],
    ai_overview: { page_token: "secret", text: "Saved text" },
  };
  const safe = redactProviderResponse(raw);
  expect(JSON.stringify(safe)).not.toContain("secret");
  expect(safe).toMatchObject({
    results: [{ title: "A result" }],
    ai_overview: { text: "Saved text" },
  });
  expect(raw.api_key).toBe("secret");
});
it("does not expose native payload through the normalized comparison view", () => {
  const retained = retainComparisonCapture(
    { results: [] } as never,
    { checkedAt: new Date(), providerResponse: { token: "secret", value: 19 } } as never,
  );
  expect(retained._providerResponse).toEqual({ token: "[redacted]", value: 19 });
  expect(publicComparisonResult(retained)).toEqual({ results: [] });
});

it("stores the native response once while keeping the public result small", () => {
  const retained = retainComparisonCapture(
    { results: [] } as never,
    {
      checkedAt: new Date(),
      providerResponse: { value: 19 },
      raw: { organic_results: [], provider_response: { value: 19, token: "secret" } },
    } as never,
  );
  expect(retained._providerResponse).toBeUndefined();
  expect(retained._capture?.raw?.provider_response).toEqual({ value: 19, token: "[redacted]" });
  expect(publicComparisonResult(retained)).toEqual({ results: [] });
});

it("adds rich previews to older comparison captures without exposing native response or losing saved AI content", () => {
  const value = {
    results: [],
    features: {
      aiOverview: { present: true, paragraphs: ["Saved answer"], sources: [] },
      localPack: { present: false, places: [] },
    },
    _capture: {
      raw: {
        provider_response: [
          {
            inline_images: [
              { title: "Image", thumbnail: "https://example.com/image.jpg", secret: "private" },
            ],
          },
        ],
      },
    },
  };
  const projected = publicComparisonResult(value);
  expect(projected?.features?.aiOverview.paragraphs).toEqual(["Saved answer"]);
  expect(projected?.features?.richFeatures?.[0]).toMatchObject({
    kind: "images",
    items: [{ title: "Image" }],
  });
  expect(JSON.stringify(projected)).not.toContain("private");
  expect(projected).not.toHaveProperty("_capture");
});
