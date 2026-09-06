import type { MarketRef, ProjectRef } from "@/lib/routing/app-path";

/**
 * What the server resolved from the URL, handed to client components as-is. It carries no
 * internal database id, and it is derived from the URL alone so two people opening the same
 * link see the same value.
 */
export type MarketContextValue = {
  market: { locationId: string; ref: MarketRef } | null;
  projectRef: ProjectRef;
};

/** The project level: a page that is not scoped to any market. */
export function projectLevelContext(projectRef: ProjectRef): MarketContextValue {
  return { market: null, projectRef };
}
