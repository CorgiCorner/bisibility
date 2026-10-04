import type { DateWindow } from "./dates";

/** Search Console's report URL, kept separate from its data API contract. */
export function searchConsoleQueryHref(property: string, query: string, window: DateWindow) {
  const url = new URL("https://search.google.com/search-console/performance/search-analytics");
  url.searchParams.set("resource_id", property);
  url.searchParams.set("query", `!${query}`);
  url.searchParams.set(
    "dates",
    `${window.start.replaceAll("-", "")},${window.end.replaceAll("-", "")}`,
  );
  url.searchParams.set("type", "web");
  url.searchParams.set("breakdown", "page");
  return url.toString();
}
