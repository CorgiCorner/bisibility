import type { TrackingEngine, TrackingSource } from "@/lib/ai-tracking/contract";

/** The run drawer preselection from before projects stored an engine set. */
export const HISTORICAL_DRAWER_ENGINE = {
  engine: "chat_gpt",
  source: "consumer_scrape",
} as const satisfies { engine: TrackingEngine; source: TrackingSource };

type EnginePick = { engine: TrackingEngine; source: TrackingSource };

/**
 * A saved schedule wins, then an explicit preset (Ask other engines), then the
 * project's enabled engine. The historical pair is only the empty fallback.
 */
export function resolveDrawerEngine(input: {
  preset?: EnginePick | null;
  project?: EnginePick | null;
  saved?: { engine?: string | null; source?: string | null } | null;
}): EnginePick {
  const source =
    input.saved?.source ??
    input.preset?.source ??
    input.project?.source ??
    HISTORICAL_DRAWER_ENGINE.source;
  const engine =
    input.saved?.engine ??
    input.preset?.engine ??
    input.project?.engine ??
    HISTORICAL_DRAWER_ENGINE.engine;
  return { engine: engine as TrackingEngine, source: source as TrackingSource };
}
