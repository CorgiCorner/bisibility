import { describe, expect, it } from "vitest";
import { dataForSeoOrganicDecision, dataForSeoRawPayload } from "./dataforseo-payload";
import {
  decideOrganicResult,
  type OrganicResultDecision,
  organicResultNormalization,
} from "./organic-result-decision";
import { organicResultGoldenFixtures } from "./organic-result-golden-fixtures";
import { rawPayload, type SerpApiResponse, serpApiOrganicCandidates } from "./serpapi-payload";

type DeterminateDecision = Exclude<OrganicResultDecision, { outcome: "indeterminate" }>;

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function payloadDecision(value: OrganicResultDecision): DeterminateDecision {
  return value as DeterminateDecision;
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
    normalization: organicResultNormalization(payloadDecision(decision)),
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
    const dataForSeo = dataForSeoRawPayload(
      fixture.dataForSeoItems,
      payloadDecision(dataForSeoDecision),
    );
    const serpApi = rawPayload(pages, payloadDecision(serpApiDecision));
    const expectedDataForSeo = expectedPayload(
      dataForSeoDecision,
      dataForSeoFeatures(fixture.dataForSeoItems),
    );
    const expectedSerpApi = expectedPayload(serpApiDecision, []);

    expect(dataForSeo).toStrictEqual(expectedDataForSeo);
    expect(serpApi).toStrictEqual(expectedSerpApi);
    expect(Object.keys(dataForSeo)).toEqual(Object.keys(expectedDataForSeo));
    expect(Object.keys(serpApi)).toEqual(Object.keys(expectedSerpApi));
  });
});
