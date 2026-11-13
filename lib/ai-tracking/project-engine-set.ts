import {
  TRACKING_SOURCES,
  type TrackingEngine,
  type TrackingSource,
} from "@/lib/ai-tracking/contract";
import { canonicalTrackingEndpoint } from "@/lib/ai-tracking/providers/capabilities";
import { trackingEngines } from "@/lib/ai-tracking/tracking-engines";

export type ProjectEngineChoice = {
  engine: TrackingEngine;
  source: TrackingSource;
};

export type StoredProjectEngine = {
  enabled: boolean;
  engine: string;
  source: string;
};

/**
 * Pairs the run form offers and the tracking endpoint accepts. Google AI Overview is
 * runnable here, but the Engines tab does not toggle it.
 */
export function runnableProjectEngines(): ProjectEngineChoice[] {
  const pairs: ProjectEngineChoice[] = [];
  for (const source of TRACKING_SOURCES) {
    for (const engine of trackingEngines(source)) {
      try {
        canonicalTrackingEndpoint(source, engine);
      } catch {
        continue;
      }
      pairs.push({ engine, source });
    }
  }
  return pairs;
}

/** Engines the project can turn on. Rank Tracker owns Google AI Overview. */
export function toggleableProjectEngines(): ProjectEngineChoice[] {
  return runnableProjectEngines().filter(
    (pair) => pair.source !== "google_aio" || pair.engine !== "google",
  );
}

/** What the run drawer preselected before a project stored any engine rows. */
export const DEFAULT_PROJECT_ENGINE: ProjectEngineChoice = {
  engine: "chat_gpt",
  source: "consumer_scrape",
};

/**
 * No stored rows (or none that tracking can still run) keep the historical default.
 * Stored rows replace that default, including when every stored engine is off.
 */
export function projectEngineSelection(stored: readonly StoredProjectEngine[]): {
  enabled: ProjectEngineChoice[];
  usingDefault: boolean;
} {
  const toggleable = toggleableProjectEngines();
  const known = stored.filter((row) =>
    toggleable.some((pair) => pair.engine === row.engine && pair.source === row.source),
  );
  if (known.length === 0) return { enabled: [DEFAULT_PROJECT_ENGINE], usingDefault: true };
  return {
    enabled: toggleable.filter((pair) =>
      known.some((row) => row.enabled && row.engine === pair.engine && row.source === pair.source),
    ),
    usingDefault: false,
  };
}
