import { describe, expect, it } from "vitest";
import { dataForSeoOrganicDecision, dataForSeoRawPayload } from "./dataforseo-payload";
import {
  decideOrganicResult,
  type OrganicResultDecision,
  organicResultNormalization,
} from "./organic-result-decision";
import { organicResultGoldenFixtures } from "./organic-result-golden-fixtures";
import { rawPayload, type SerpApiResponse, serpApiOrganicCandidates } from "./serpapi-payload";

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function dataForSeoFeatures(items: readonly unknown[]) {
  const features = new Set<string>();
  for (const value of items) {
    const type = record(value)?.type;
    if (typeof type === "string" && type !== "organic") {
      features.add(type.trim().replace(/[_-]+/g, " "));
    }
  }
  return [...features];
}

function expectedPayload(decision: OrganicResultDecision, features: string[]) {
  return {
    ...(decision.outcome === "indeterminate"
      ? {}
      : { normalization: organicResultNormalization(decision) }),
    organic_results: decision.organicResults,
    ...(features.length ? { serp_features: features } : {}),
  };
}

describe("historical raw payload parity", () => {
  it.each(organicResultGoldenFixtures)("$name", (fixture) => {
    const dataForSeoDecision = dataForSeoOrganicDecision(
      fixture.dataForSeoItems,
      "example.com",
      fixture.depth,
    );
    const pages: SerpApiResponse[] = [{ organic_results: fixture.serpApiResults }];
    const serpApiDecision = decideOrganicResult({
      candidates: serpApiOrganicCandidates(fixture.serpApiResults, 0),
      depth: fixture.depth,
      domain: "example.com",
    });
    const dataForSeo = dataForSeoRawPayload(fixture.dataForSeoItems, dataForSeoDecision);
    const serpApi = rawPayload(pages, serpApiDecision);
    const expectedDataForSeo = expectedPayload(
      dataForSeoDecision,
      dataForSeoFeatures(fixture.dataForSeoItems),
    );
    const expectedSerpApi = { provider_response: pages, ...expectedPayload(serpApiDecision, []) };

    expect(dataForSeo).toStrictEqual(expectedDataForSeo);
    expect(serpApi).toStrictEqual(expectedSerpApi);
    expect(Object.keys(dataForSeo)).toEqual(Object.keys(expectedDataForSeo));
    expect(Object.keys(serpApi)).toEqual(Object.keys(expectedSerpApi));
  });
});

it("retains native response fields independently of normalized organic results", () => {
  const decision = decideOrganicResult({ candidates: [], depth: 20, domain: "example.com" });
  const native = {
    status_code: 20000,
    tasks: [{ result: [{ items: [], ai_overview: { text: "Summary", page_token: "secret" } }] }],
    headers: { authorization: "secret" },
  };
  const raw = dataForSeoRawPayload([], decision, native);
  expect(raw.organic_results).toEqual([]);
  expect(raw.provider_response).toEqual({
    status_code: 20000,
    tasks: [
      { result: [{ items: [], ai_overview: { text: "Summary", page_token: "[redacted]" } }] },
    ],
    headers: "[redacted]",
  });
  expect(native.headers.authorization).toBe("secret");
});
