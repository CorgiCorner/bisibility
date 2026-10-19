import { expect, it } from "vitest";
import { parseRankRunListQuery } from "./rank-run-list-query";

it("preserves the page defaults, empty values, and status CSV validation", () => {
  expect(parseRankRunListQuery(new URL("https://example.com?limit=&cursor=&status="))).toEqual({
    limit: undefined,
    cursor: undefined,
    segment: undefined,
    status: "",
  });
  expect(
    parseRankRunListQuery(
      new URL("https://example.com?limit=25&segment=planned&status=planned,%20blocked"),
    ),
  ).toMatchObject({
    limit: 25,
    segment: "planned",
    status: "planned, blocked",
  });
});
it.each([
  "limit=201",
  "limit=1.5",
  "limit=junk",
  "segment=",
  "segment=future",
  "status=future",
  "status=planned,",
])("rejects %s", (query) => {
  expect(() => parseRankRunListQuery(new URL(`https://example.com?${query}`))).toThrow();
});
