/**
 * Observation contract for PR0 (SERP observation capture). Shared by the provider adapters,
 * which produce it, and rank-check persistence, which stores it. See ADR-015
 * (observability kernel).
 *
 * The five axes are never mixed (ADR-015): surface, engine, provider and resultKind are
 * separate fields with separate vocabularies. PR0 enables exactly one surface and engine.
 */

export const observationSurfaces = ["web_serp"] as const;
export type ObservationSurface = (typeof observationSurfaces)[number];

export const observationEngines = ["google"] as const;
export type ObservationEngine = (typeof observationEngines)[number];

export const observationCompleteness = [
  "complete",
  "truncated_by_stop_on_match",
  "unknown",
] as const;
export type ObservationCompleteness = (typeof observationCompleteness)[number];

/** Result kinds PR0 extracts. `organic_result` stays on `RankCheck.organicRanks` for now. */
export const observationResultKinds = ["organic_result", "local_pack", "ai_overview"] as const;
export type ObservationResultKind = (typeof observationResultKinds)[number];

export type ObservationRequestPolicy = {
  depth: number;
  stopOnMatch: boolean;
  /** Provider-side target matching, when the request carried one (e.g. `with_subdomains`). */
  findTargetsIn?: string | null;
  /** PR0 never requests forced or async AI overview; recorded so a later reader can tell. */
  forcedAiOverview: false;
};

export type ObservationScope = {
  location: string;
  language: string;
  device: string;
};

export type ObservationRating = {
  value: number | null;
  count: number | null;
};

export type ObservationItemInput = {
  resultKind: ObservationResultKind;
  rankGroup?: number | null;
  rankAbsolute?: number | null;
  /** Position of the feature block on the page (1-based), when the provider supplies it. */
  blockPosition?: number | null;
  /** Position of this item inside its block (1-based). */
  positionInBlock?: number | null;
  title?: string | null;
  url?: string | null;
  domain?: string | null;
  businessName?: string | null;
  placeId?: string | null;
  /** Opaque string everywhere (ADR-015); never parsed as a number. */
  cid?: string | null;
  mapsUrl?: string | null;
  rating?: ObservationRating | null;
  /** The provider fragment for this item only, never the whole page. */
  rawFragment: unknown;
};

export type ObservationRunInput = {
  provider: string;
  surface: ObservationSurface;
  engine: ObservationEngine;
  requestPolicy: ObservationRequestPolicy;
  completeness: ObservationCompleteness;
  configuredScope: ObservationScope;
  effectiveScope?: ObservationScope | null;
  executedAt: Date;
  items: ObservationItemInput[];
};
