import { beforeEach, describe, expect, it, vi } from "vitest";
import { matchProjectKeywords } from "./keyword-matches";
import { keywordResearchRoute } from "./routes-keyword-research";

const mocks = vi.hoisted(() => ({
  findMatches: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/queries/keyword-matches", () => ({
  findKeywordMatches: mocks.findMatches,
}));

function context(texts: string[], projectPublicId = "prj_1") {
  const url = new URL("https://example.test/api/v1/projects/prj_1/keyword-matches");
  return {
    auth: { project: { id: "project_1", publicId: projectPublicId } },
    headers: new Headers(),
    instance: "urn:bisibility:api:v1:keyword-matches",
    method: "POST",
    path: ["projects", "prj_1", "keyword-matches"],
    req: new Request(url, {
      body: JSON.stringify({ texts }),
      headers: { "content-type": "application/json" },
      method: "POST",
    }),
    url,
  } as never;
}

describe("project keyword matches API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findMatches.mockResolvedValue({ matches: [], truncatedTexts: [] });
  });

  it("returns joinable normalized text alongside the stored keyword text", async () => {
    mocks.findMatches.mockResolvedValue({
      matches: [
        {
          countryCode: "US",
          device: "desktop",
          keywordId: "kw_1",
          languageCode: "en",
          languageLabel: "English",
          latestPosition: 3,
          location: "United States",
          locationKey: "US",
          matchedText: "headless cms",
          previousPosition: 5,
          rankingUrl: "https://example.com/ranked",
          text: "headless cms",
        },
        {
          countryCode: "PL",
          device: "mobile",
          keywordId: "kw_2",
          languageCode: "pl",
          languageLabel: "Polish",
          latestPosition: null,
          location: "Poland",
          locationKey: "PL",
          matchedText: "headless cms",
          previousPosition: null,
          rankingUrl: null,
          text: "Headless CMS",
        },
        {
          countryCode: "GB",
          device: "desktop",
          keywordId: "kw_3",
          languageCode: "en",
          languageLabel: "English",
          latestPosition: null,
          location: "United Kingdom",
          locationKey: "GB",
          matchedText: "headless cms",
          previousPosition: null,
          rankingUrl: null,
          text: "HEADLESS CMS",
        },
      ],
      truncatedTexts: ["headless cms"],
    });

    const response = await matchProjectKeywords(
      context([" Headless CMS ", "seo tooling"]),
      "prj_1",
    );

    expect(mocks.findMatches).toHaveBeenCalledWith("project_1", ["Headless CMS", "seo tooling"]);
    const body = await response.json();
    expect(body.data).toHaveLength(3);
    expect(body.data.every((row: object) => Object.hasOwn(row, "ranking_url"))).toBe(true);
    expect(body).toEqual({
      data: [
        {
          keyword_id: "kw_1",
          latest_position: 3,
          matched_text: "headless cms",
          market: {
            country_code: "US",
            device: "desktop",
            language_code: "en",
            language_label: "English",
            location: "United States",
            location_key: "US",
          },
          previous_position: 5,
          ranking_url: "https://example.com/ranked",
          text: "headless cms",
        },
        {
          keyword_id: "kw_2",
          latest_position: null,
          matched_text: "headless cms",
          market: {
            country_code: "PL",
            device: "mobile",
            language_code: "pl",
            language_label: "Polish",
            location: "Poland",
            location_key: "PL",
          },
          previous_position: null,
          ranking_url: null,
          text: "Headless CMS",
        },
        {
          keyword_id: "kw_3",
          latest_position: null,
          matched_text: "headless cms",
          market: {
            country_code: "GB",
            device: "desktop",
            language_code: "en",
            language_label: "English",
            location: "United Kingdom",
            location_key: "GB",
          },
          previous_position: null,
          ranking_url: null,
          text: "HEADLESS CMS",
        },
      ],
      meta: { truncated_texts: ["headless cms"] },
    });
  });

  it("rejects an over-limit request instead of truncating it", async () => {
    await expect(
      matchProjectKeywords(
        context(Array.from({ length: 51 }, (_, index) => `keyword ${index}`)),
        "prj_1",
      ),
    ).rejects.toThrow();
    expect(mocks.findMatches).not.toHaveBeenCalled();
  });

  it("forbids a project outside the credential scope", async () => {
    const response = await matchProjectKeywords(context(["test"]), "prj_other");

    expect(response.status).toBe(403);
    expect(mocks.findMatches).not.toHaveBeenCalled();
  });

  it("is registered as a project keyword sub-resource", async () => {
    const response = await keywordResearchRoute(context(["headless cms"]));

    expect(response).toBeInstanceOf(Response);
    expect((response as Response).status).toBe(200);
    expect(mocks.findMatches).toHaveBeenCalledWith("project_1", ["headless cms"]);
  });
});
