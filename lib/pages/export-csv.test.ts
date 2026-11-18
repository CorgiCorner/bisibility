import { connectedSources, pageRow } from "@/lib/pages/pages.test-fixture";
import { expect, it } from "vitest";
import { projectPagesCsv } from "./export-csv";

it("exports ordered columns, quoting, unknown metrics, dates, tags and all three sitemap states", () => {
  const first = pageRow({
    path: '/a,"b',
    url: 'https://example.com/a,"b',
    tags: [
      { id: "a", name: "=1+1" },
      { id: "b", name: 'quoted,"tag"' },
    ],
    searchConsole: null,
    sessions: null,
    sitemap: { listed: null, lastSeenAt: null },
  });
  const csv = projectPagesCsv(
    [first, pageRow(), pageRow({ sitemap: { listed: false, lastSeenAt: null } })],
    ["tags", "path", "sitemap", "clicks", "sessions", "position"],
    connectedSources(),
  );
  expect(csv.split("\n")[0]).toBe(
    "tags,url,path,first_seen_at,last_seen_at,sitemap_state,sitemap_last_seen_at,clicks,sessions,avg_position",
  );
  expect(csv).toContain('"\'=1+1 | quoted,""tag"""');
  expect(csv).toContain('"https://example.com/a,""b","/a,""b"');
  expect(csv).toContain("2026-01-01T00:00:00.000Z,2026-02-02T00:00:00.000Z,not_checked,,,,");
  expect(csv).toContain(",in_sitemap,2026-02-01T00:00:00.000Z,8,6,2.5");
  expect(csv).toContain(",not_in_sitemap,,8,6,2.5");
});
it("does not report zero metrics when their sources are unavailable", () => {
  expect(
    projectPagesCsv([pageRow({ keywords: 0, aiCitations: 0 })], ["keywords", "aiCitations"], []),
  ).toBe("keywords,ai_citations\n,");
});

it.each([
  ["=sum(1)", "'=sum(1)"],
  ["+sum(1)", "'+sum(1)"],
  ["-sum(1)", "'-sum(1)"],
  ["@sum(1)", "'@sum(1)"],
  ["\ttext", "'\ttext"],
  ["\rtext", '"\'\rtext"'],
  ["first\nsecond", '"first\nsecond"'],
  ['café, "日本語"', '"café, ""日本語"""'],
])("uses shared CSV escaping for %j", (name, expected) => {
  expect(projectPagesCsv([pageRow({ tags: [{ id: "a", name }] })], ["tags"], [])).toBe(
    `tags\n${expected}`,
  );
});
