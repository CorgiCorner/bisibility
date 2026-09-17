/**
 * The public build ships no vendor marketing pages, so no path has page-specific
 * Markdown and content negotiation falls back to the generic document.
 */
export function pageMarkdown(_pathname: string, _pageUrl: string): string | null {
  return null;
}
