import "server-only";

/** Standalone builds have no hosted suggestion page. */
export function suggestToolHref(): string | null {
  return null;
}
