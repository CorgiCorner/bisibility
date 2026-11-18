import { expect, it } from "vitest";
import {
  canary,
  forbidNetwork,
  normalized,
  searchFixture,
  textFixture,
} from "./fixtures.test-support";

forbidNetwork();

// Synthetic values using the documented direct-search result and citation shapes.
const source = (url = "https://example.org/source", title: string | null = "Source") => ({
  type: "web_search_result",
  url,
  title,
});
const citation = (url = "https://example.org/source", title: string | null = "Source") => ({
  ...source(url, title),
  type: "web_search_result_location",
});
function response(sources = [source()], citations = [citation()]) {
  return {
    ...searchFixture(),
    content: [
      { type: "server_tool_use", name: "web_search", id: "srv1", input: { query: "synthetic" } },
      { type: "web_search_tool_result", tool_use_id: "srv1", content: sources },
      { type: "text", text: "Answer", citations },
    ],
  };
}

it("counts distinct returned sources independently from citation occurrences", () => {
  const result = normalized(
    response(
      [source(), source("https://EXAMPLE.org/source"), source("https://example.org/uncited")],
      [citation(), citation()],
    ),
    true,
  );
  expect(result).toMatchObject({
    state: "completed",
    citationTotals: { total: 2, omitted: 0 },
    consultedSources: { total: 2, omitted: 0, truncated: false },
  });
  expect(result.citations).toHaveLength(2);
  expect(result.consultedSources?.sources.map((item) => item.url)).toEqual([
    "https://example.org/source",
    "https://example.org/uncited",
  ]);
  expect(result.consultedSources?.sources[0].sourceId).toBe(result.citations[0].sourceId);
});
it("does not synthesize a consulted list from citation-only content", () => {
  const result = normalized(
    { ...textFixture(), content: [{ type: "text", text: "Answer", citations: [citation()] }] },
    true,
  );
  expect(result).not.toHaveProperty("consultedSources");
  expect(result.citationTotals).toEqual({ total: 1, omitted: 0 });
});
it("distinguishes an observed empty result list from missing source evidence", () => {
  expect(normalized(response([], []), true).consultedSources).toEqual({
    sources: [],
    total: 0,
    omitted: 0,
    truncated: false,
  });
  expect(normalized()).not.toHaveProperty("consultedSources");
});
it("bounds returned sources and occurrences independently with exact omission counts", () => {
  const sources = Array.from({ length: 103 }, (_, i) => source(`https://example.org/${i}`));
  const result = normalized(
    response(
      sources,
      Array.from({ length: 102 }, () => citation()),
    ),
    true,
  );
  expect(result.citations).toHaveLength(100);
  expect(result.citationTotals).toEqual({ total: 102, omitted: 2 });
  expect(result.consultedSources).toMatchObject({ total: 103, omitted: 3, truncated: true });
  expect(result.consultedSources?.sources).toHaveLength(100);
});
it("does not mark an answer partial solely for consulted source omissions", () => {
  const result = normalized(
    response(
      Array.from({ length: 101 }, (_, i) => source(`https://example.org/${i}`)),
      [],
    ),
    true,
  );
  expect(result.state).toBe("completed");
  expect(result.truncation).toEqual({ application: false, provider: false, citations: false });
  expect(result.consultedSources).toMatchObject({ total: 101, omitted: 1, truncated: true });
});
it.each(["bad\ud800", "bad\udc00", `${"a".repeat(512)}\ud800`, `${"a".repeat(512)}${canary}`])(
  "drops unsafe titles before retention: %s",
  (title) => {
    const result = normalized(
      response([source(undefined, title)], [citation(undefined, title)]),
      true,
    );
    expect(result.citations).toEqual([]);
    expect(result.citationTotals).toEqual({ total: 1, omitted: 1 });
    expect(result.truncation.citations).toBe(true);
    expect(result.consultedSources).toEqual({ sources: [], total: 1, omitted: 1, truncated: true });
    expect(JSON.stringify(result)).not.toContain(canary);
  },
);
it("does not claim distinct source totals when a returned URL cannot be identified safely", () => {
  const result = normalized(
    response([source(), source("javascript:invalid")], [citation("javascript:invalid")]),
    true,
  );
  expect(result.consultedSources).toMatchObject({ total: null, omitted: null, truncated: true });
  expect(result.consultedSources?.sources).toHaveLength(1);
  expect(result.citationTotals).toEqual({ total: 1, omitted: 1 });
});
it("drops overlong consulted titles but retains the bounded citation title with its truncation flag", () => {
  const result = normalized(
    response([source(undefined, "a".repeat(513))], [citation(undefined, "a".repeat(513))]),
    true,
  );
  expect(result.consultedSources).toEqual({ sources: [], total: 1, omitted: 1, truncated: true });
  expect(result.citations[0].title).toHaveLength(512);
  expect(result.citationTotals).toEqual({ total: 1, omitted: 0 });
  expect(result.truncation.citations).toBe(true);
});
it("preserves valid supplementary Unicode in both title kinds", () => {
  const title = `${"a".repeat(510)}😀`;
  const result = normalized(
    response([source(undefined, title)], [citation(undefined, title)]),
    true,
  );
  expect(result.citations[0].title).toBe(title);
  expect(result.consultedSources?.sources[0].title).toBe(title);
  expect(result.consultedSources).toMatchObject({ total: 1, omitted: 0, truncated: false });
});
it("counts citations excluded by answer truncation without dropping consulted evidence", () => {
  const body = response();
  body.content[2] = { type: "text", text: "x".repeat(25000), citations: [citation()] };
  const result = normalized(body, true);
  expect(result.citations).toEqual([]);
  expect(result.citationTotals).toEqual({ total: 1, omitted: 1 });
  expect(result.consultedSources).toMatchObject({ total: 1, omitted: 0, truncated: false });
  expect(result.consultedSources?.sources).toHaveLength(1);
});
