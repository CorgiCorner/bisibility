import { ProviderUsagePersistenceError } from "@/lib/providers/usage";
import { describe, expect, it, vi } from "vitest";
import { dataForSeoOrganicDecision } from "./dataforseo-payload";
import duplicates from "./fixtures/goto/converter_duplicates.json";
import converter from "./fixtures/goto/converter_full_page.json";
import splitFirst from "./fixtures/goto/converter_split_part1.json";
import splitSecond from "./fixtures/goto/converter_split_part2.json";
import source from "./fixtures/goto/task_get_goto_heavy.json";
import pageTwo from "./fixtures/goto/task_get_goto_page2.json";
import partial from "./fixtures/goto/task_get_partial_40106.json";
import zero from "./fixtures/goto/task_get_zero_goto.json";
import { resolveRedirectRows, unresolvedRows } from "./redirect-resolution";

const items = source.tasks[0].result.flatMap((result) => result.items);
const mappings = converter.response.tasks[0].result;

describe("redirect resolution", () => {
  it("maps reordered results by original URL and preserves the ranking", async () => {
    expect(dataForSeoOrganicDecision(items, "site18.example.com", 20).outcome).toBe(
      "indeterminate",
    );
    const transport = vi.fn(async () => [...mappings].reverse());
    const result = await resolveRedirectRows(items, transport);
    expect(transport).toHaveBeenCalledOnce();
    expect(dataForSeoOrganicDecision(result.candidates, "site18.example.com", 20)).toMatchObject({
      outcome: "match",
      position: 3,
      rankingUrl: "https://site18.example.com/page-39",
    });
    expect(dataForSeoOrganicDecision(result.candidates, "example.org", 20).outcome).toBe(
      "no_match",
    );
  });

  it("deduplicates input and rejects foreign, invalid, null and redirect destinations", async () => {
    const first = items[1];
    const next = items[3];
    const transport = vi.fn(async (_urls: readonly string[]) => [
      { goto: "https://google.com/goto?url=foreign", url: "https://example.org" },
      { goto: first.url, url: "ftp://example.org" },
      { goto: first.url, url: "https://user:pass@example.com" },
      { goto: first.url, url: null },
      { goto: next.url, url: "https://www.google.com/goto?url=x" },
      { goto: next.url, url: "https://google.com./goto?url=x" },
    ]);
    const result = await resolveRedirectRows([first, first, next], transport);
    expect(transport.mock.calls[0][0]).toEqual([first.url, next.url]);
    expect(result.mappings).toEqual({});
    expect(result.resolutions.map((value) => value.status)).toEqual([
      "unresolved",
      "unresolved",
      "unresolved",
    ]);
  });

  it("leaves an earlier unresolved result indeterminate but permits an earlier match", async () => {
    const partial = await resolveRedirectRows(items, async () => [mappings[1]]);
    expect(dataForSeoOrganicDecision(partial.candidates, "site18.example.com", 20).outcome).toBe(
      "indeterminate",
    );
    const first = await resolveRedirectRows(items, async () => [mappings[0]]);
    expect(dataForSeoOrganicDecision(first.candidates, "site4.example.com", 20)).toMatchObject({
      outcome: "match",
      position: 1,
    });
  });
});

it("batches unique inputs, reuses previous mappings and preserves duplicate rows", async () => {
  const rows = Array.from({ length: 201 }, (_, index) => ({
    type: "organic",
    rank_group: index + 1,
    url: `https://www.google.com/goto?url=${index}&gsessionid=synthetic`,
    domain: "google.com",
  }));
  rows.push(rows[0]);
  const transport = vi.fn(async (urls: readonly string[]) =>
    urls.map((goto) => ({ goto, url: "http://example.org/page" })),
  );
  const result = await resolveRedirectRows(rows, transport, {
    [rows[0].url]: "https://example.com/page",
  });
  expect(transport.mock.calls.map(([batch]) => batch.length)).toEqual([100, 100]);
  expect(result.resolutions[0]).toEqual(result.resolutions[201]);
  expect(result.candidates[0].domain).toBe("example.com");
  expect(result.candidates[1]).toMatchObject({
    domain: "example.org",
    rank_group: 2,
    url: "http://example.org/page",
  });
});

it("keeps relative and query redirects unresolved and out of the converter", async () => {
  const accepted = "https://www.google.com/goto?url=ok";
  const rows = [
    { type: "organic", url: accepted },
    { type: "organic", url: "/goto?url=https%3A%2F%2Fexample.com" },
    { type: "organic", url: "//www.google.com/goto?url=x" },
    { type: "organic", url: "https://www.google.com/url?q=https://example.org" },
    { type: "organic", url: "/url?q=https%3A%2F%2Fexample.org" },
    { type: "organic", url: "http://google.com/goto?url=x" },
  ];
  const transport = vi.fn(async (urls: readonly string[]) =>
    urls.map((goto) => ({ goto, url: "https://example.com/dest" })),
  );
  const result = await resolveRedirectRows(rows, transport);
  expect(transport.mock.calls[0][0]).toEqual([accepted]);
  expect(result.resolutions.map((row) => row.status)).toEqual([
    "resolved",
    "unresolved",
    "unresolved",
    "unresolved",
    "unresolved",
    "unresolved",
  ]);
});

it("does not send non-HTTPS, non-Google or non-organic URLs", async () => {
  const rows = [
    { type: "organic", url: "http://google.com/goto?url=x" },
    { type: "organic", url: "https://example.com/goto?url=x" },
    { type: "organic", url: "https://google.com/search?url=x" },
    { type: "video", url: "https://google.com/goto?url=x" },
  ];
  const transport = vi.fn();
  const result = await resolveRedirectRows(rows, transport);
  expect(transport).not.toHaveBeenCalled();
  expect(result.candidates).toEqual(rows);
  // The decision guard treats the plain-HTTP redirect as indeterminate: it must stay unresolved.
  expect(result.resolutions.map((row) => row.status)).toEqual([
    "unresolved",
    "not_redirect",
    "not_redirect",
    "not_redirect",
  ]);
  expect(result.retryable).toBe(false);
  expect(unresolvedRows(rows)).toEqual(result);
});

it("reports whether another conversion could resolve a row", async () => {
  const described = unresolvedRows(items);
  expect(described.candidates).toBe(items);
  expect(described.retryable).toBe(true);
  expect(described.resolutions.filter((row) => row.status === "unresolved")).toHaveLength(15);
  const complete = await resolveRedirectRows(items, async () => mappings);
  expect(complete.retryable).toBe(false);
  const partialResult = await resolveRedirectRows(items, async () => mappings.slice(1));
  expect(partialResult.retryable).toBe(true);
});

it.each([zero, partial])("preserves results without redirects", async (fixture) => {
  const pages: Array<{ items: unknown[] }> = fixture.tasks[0].result;
  const rows = pages.flatMap((page) => page.items);
  const transport = vi.fn();
  const result = await resolveRedirectRows(rows, transport);
  expect(transport).not.toHaveBeenCalled();
  expect(dataForSeoOrganicDecision(result.candidates, "site18.example.com", 20)).toEqual(
    dataForSeoOrganicDecision(rows, "site18.example.com", 20),
  );
});

it("resolves session-bearing URLs and duplicate converter rows by their original keys", async () => {
  const rows = pageTwo.tasks[0].result.flatMap((page) => page.items);
  const reversed = [
    ...splitFirst.response.tasks[0].result,
    ...splitSecond.response.tasks[0].result,
  ].reverse();
  const result = await resolveRedirectRows(rows, async () => reversed);
  expect(dataForSeoOrganicDecision(result.candidates, "site1.example.com", 20)).toMatchObject({
    outcome: "match",
    position: 2,
  });
  expect(result.resolutions.filter((row) => row.status === "resolved")).toHaveLength(15);
  const repeated = duplicates.request[0].goto_urls.map((url) => ({ type: "organic", url }));
  const transport = vi.fn(async () => [...duplicates.response.tasks[0].result].reverse());
  const repeatedResult = await resolveRedirectRows(repeated, transport);
  expect(repeatedResult.candidates[0].url).toBe(repeatedResult.candidates[2].url);
  expect(repeatedResult.candidates[1].url).toBe(repeatedResult.candidates[4].url);
});

it.each([null, "ftp://example.org/page", "https://google.com./goto?url=x", "not a URL"])(
  "leaves an unsafe destination unresolved",
  async (url) => {
    const row = { type: "organic", url: "https://google.com/goto?url=synthetic" };
    const result = await resolveRedirectRows([row], async () => [{ goto: row.url, url }]);
    expect(result.resolutions[0].status).toBe("unresolved");
    expect(result.candidates[0]).toEqual(row);
  },
);

it("does not turn an archive failure into another converter request", async () => {
  const failure = new ProviderUsagePersistenceError({ phase: "settlement" });
  const transport = vi.fn(async () => {
    throw failure;
  });
  await expect(resolveRedirectRows(items, transport)).rejects.toBe(failure);
  expect(transport).toHaveBeenCalledOnce();
});
