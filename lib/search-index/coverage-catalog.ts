const DOCS = "https://support.google.com/webmasters/answer/7440203";

export const genericCoverageDocs = DOCS;

const statuses = [
  ["Crawled - currently not indexed", "crawledNotIndexed"],
  ["Discovered - currently not indexed", "discoveredNotIndexed"],
  ["Duplicate without user-selected canonical", "duplicateCanonical"],
  ["Alternate page with proper canonical tag", "alternateCanonical"],
  ["Page with redirect", "pageWithRedirect"],
  ["Not found (404)", "notFound"],
  ["Soft 404", "soft404"],
  ["Excluded by 'noindex' tag", "noindex"],
  ["Blocked by robots.txt", "robots"],
  ["Server error (5xx)", "serverError"],
] as const;

export type CoverageExplanationId = (typeof statuses)[number][1];

const byState = new Map<string, CoverageExplanationId>(statuses);

export function coverageExplanation(
  state: string,
): { href: string; id: CoverageExplanationId } | null {
  const id = byState.get(state);
  if (!id) return null;
  return { href: `${DOCS}#:~:text=${encodeURIComponent(state)}`, id };
}
