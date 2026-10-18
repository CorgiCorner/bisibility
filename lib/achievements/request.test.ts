import { describe, expect, it } from "vitest";
import { isPracticeEstimate } from "./request";

describe("practice request qualification", () => {
  it("excludes GET and POST estimates without consuming the actual request body", async () => {
    const url = new URL("https://example.com/api/v1/projects/a/domain-overview");
    const request = new Request(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ estimate_only: true }),
    });
    expect(await isPracticeEstimate(request, url, "analyzeDomainOverview")).toBe(true);
    expect(await request.json()).toEqual({ estimate_only: true });
    const query = new URL(`${url}?estimate_only=true`);
    expect(await isPracticeEstimate(new Request(query), query, "researchKeywords")).toBe(true);
  });
  it("accepts real operation bodies and conservatively rejects malformed estimate bodies", async () => {
    const url = new URL("https://example.com/api/v1/projects/a/domain-overview");
    expect(
      await isPracticeEstimate(
        new Request(url, { method: "POST", body: '{"estimate_only":false}' }),
        url,
        "analyzeDomainOverview",
      ),
    ).toBe(false);
    expect(
      await isPracticeEstimate(
        new Request(url, { method: "POST", body: "invalid" }),
        url,
        "analyzeDomainOverview",
      ),
    ).toBe(true);
  });
});

it.each(["analyzeDomainOverview", "getKeywordMetrics", "analyzeAiVisibility", "compareAiPrompts"])(
  "excludes body estimates for %s without consuming the request",
  async (operation) => {
    const url = new URL("https://example.com/api/v1/test");
    const req = new Request(url, { method: "POST", body: JSON.stringify({ estimate_only: true }) });
    expect(await isPracticeEstimate(req, url, operation)).toBe(true);
    expect(await req.json()).toEqual({ estimate_only: true });
  },
);
