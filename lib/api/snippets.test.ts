import { describe, expect, it } from "vitest";
import {
  API_KEY_PLACEHOLDER,
  buildCreateKeywordsCurlSnippet,
  tokenizeCurlSnippet,
} from "./snippets";

describe("buildCreateKeywordsCurlSnippet", () => {
  it("uses an angle-bracket API key placeholder", () => {
    const snippet = buildCreateKeywordsCurlSnippet("prj_1");

    expect(snippet).toContain(`Bearer ${API_KEY_PLACEHOLDER}`);
    expect(snippet).not.toContain("$BISIBILITY_API_KEY");
    expect(snippet).not.toContain("\\\\");
    expect(snippet).toContain('"country": "Spain"');
    expect(snippet).toContain('"language": "en"');
  });
});

describe("tokenizeCurlSnippet", () => {
  it("marks curl flags, strings, and placeholders", () => {
    const lines = tokenizeCurlSnippet(
      `curl -X POST https://example.com/api/v1/projects/prj_1/keywords
  -H "Authorization: Bearer ${API_KEY_PLACEHOLDER}"`,
    );

    expect(lines[0]?.map((token) => [token.text, token.tone])).toEqual([
      ["curl", "keyword"],
      [" ", undefined],
      ["-X", "keyword"],
      [" ", undefined],
      ["POST", "keyword"],
      [" https://example.com/api/v1/projects/prj_1/keywords", undefined],
    ]);
    expect(
      lines[1]?.some((token) => token.tone === "placeholder" && token.text === API_KEY_PLACEHOLDER),
    ).toBe(true);
    expect(lines[1]?.some((token) => token.tone === "string")).toBe(true);
  });
});
