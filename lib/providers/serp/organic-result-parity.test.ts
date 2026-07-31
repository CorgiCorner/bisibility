import { comparableUrl } from "@/lib/alerts/url-mismatch";
import { describe, expect, it } from "vitest";
import { dataForSeoOrganicDecision } from "./dataforseo-payload";
import { decideOrganicResult } from "./organic-result-decision";
import { organicResultGoldenFixtures } from "./organic-result-golden-fixtures";
import { serpApiOrganicCandidates } from "./serpapi-payload";

describe("provider organic-result golden fixtures", () => {
  it.each(organicResultGoldenFixtures)("$name", (fixture) => {
    const dataForSeo = dataForSeoOrganicDecision(
      fixture.dataForSeoItems,
      "example.com",
      fixture.depth,
    );
    const serpApi = decideOrganicResult({
      candidates: serpApiOrganicCandidates(fixture.serpApiResults, 0),
      depth: fixture.depth,
      domain: "example.com",
    });
    const expectedAnomalies = fixture.expected.anomalyCodes ?? [];

    for (const decision of [dataForSeo, serpApi]) {
      expect(decision.outcome).toBe(fixture.expected.outcome);
      expect(decision.position).toBe(fixture.expected.position);
      expect(decision.anomalies.map((anomaly) => anomaly.code)).toEqual(expectedAnomalies);
      expect(comparableUrl(decision.rankingUrl)).toBe(fixture.expected.urlKey ?? null);
    }

    expect(dataForSeo.rankingUrl).toBe(fixture.expected.dataForSeoUrl ?? null);
    expect(serpApi.rankingUrl).toBe(fixture.expected.serpApiUrl ?? null);
    expect(comparableUrl(dataForSeo.rankingUrl)).toBe(comparableUrl(serpApi.rankingUrl));
  });
});
