import { expect, it } from "vitest";
import { pageIndexingUrlsQuerySchema } from "./report-schema";
import { pageIndexingTableQuerySchema } from "./url-page";

it("defaults the app table to a bounded first page and stable URL ordering", () => {
  expect(pageIndexingTableQuerySchema.parse({})).toMatchObject({
    page: 1,
    limit: 50,
    sort_by: "url",
    sort_direction: "asc",
  });
});
it.each([
  { page: 0 },
  { page: 1.5 },
  { page: 100_001 },
  { limit: 101 },
  { sort_by: "arbitrary database column" },
  { sort_direction: "anything" },
])("rejects unbounded or unknown table parameters: %j", (input) => {
  expect(pageIndexingTableQuerySchema.safeParse(input).success).toBe(false);
});
it("keeps app-only sorting and page parameters outside the REST query contract", () => {
  const query = pageIndexingUrlsQuerySchema.parse({
    page: 2,
    sort_by: "crawl",
    sort_direction: "desc",
  });
  expect(query).not.toHaveProperty("page");
  expect(query).not.toHaveProperty("sort_by");
  expect(query).not.toHaveProperty("sort_direction");
});
