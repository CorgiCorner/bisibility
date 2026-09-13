import { describe, expect, it } from "vitest";
import { canonicalKeywordResearchRequest, keywordResearchRequestKey } from "./request-key";

describe("keyword research request identity", () => {
  it("hashes normalized canonical dimensions without provider credentials", () => {
    const base = canonicalKeywordResearchRequest({
      countryCode: "us",
      includeClickstream: false,
      languageCode: "EN",
      mode: "ideas",
      resultLimit: 100,
      seed: "  Rank   Tracker  ",
    });
    expect(base).toMatchObject({
      countryCode: "US",
      languageCode: "en",
      normalizedSeed: "rank tracker",
      seed: "Rank Tracker",
    });
    expect(keywordResearchRequestKey(base)).toMatch(/^[a-f0-9]{64}$/);
    expect(keywordResearchRequestKey(base)).toBe(keywordResearchRequestKey({ ...base }));
    expect(keywordResearchRequestKey(base)).not.toBe(
      keywordResearchRequestKey({
        ...base,
        connectionPublicId: "conn_a00000000000000000000000",
      }),
    );
  });
});
