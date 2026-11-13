import { TRACKING_ENGINES, TRACKING_SOURCES } from "@/lib/ai-tracking/contract";
import { canonicalTrackingEndpoint } from "@/lib/ai-tracking/providers/capabilities";
import { trackingEngines } from "@/lib/ai-tracking/tracking-engines";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_PROJECT_ENGINE,
  projectEngineSelection,
  runnableProjectEngines,
  toggleableProjectEngines,
} from "./project-engine-set";

describe("project engine set", () => {
  it("derives runnable pairs from the form catalog and the tracking endpoint", () => {
    const derived = [];
    for (const source of TRACKING_SOURCES) {
      for (const engine of trackingEngines(source)) {
        expect(() => canonicalTrackingEndpoint(source, engine)).not.toThrow();
        derived.push({ engine, source });
      }
    }
    expect(runnableProjectEngines()).toEqual(derived);
    expect(runnableProjectEngines()).toEqual([
      { engine: "chat_gpt", source: "consumer_scrape" },
      { engine: "gemini", source: "consumer_scrape" },
      { engine: "chat_gpt", source: "model_api" },
      { engine: "google", source: "google_aio" },
    ]);
    for (const engine of TRACKING_ENGINES) {
      if (engine === "claude" || engine === "perplexity") {
        expect(runnableProjectEngines().some((pair) => pair.engine === engine)).toBe(false);
      }
    }
  });

  it("keeps Google AI Overview runnable and out of the project toggles", () => {
    expect(toggleableProjectEngines()).toEqual([
      { engine: "chat_gpt", source: "consumer_scrape" },
      { engine: "gemini", source: "consumer_scrape" },
      { engine: "chat_gpt", source: "model_api" },
    ]);
  });

  it("uses the historical drawer default until the project stores a row", () => {
    expect(DEFAULT_PROJECT_ENGINE).toEqual({ engine: "chat_gpt", source: "consumer_scrape" });
    expect(projectEngineSelection([])).toEqual({
      enabled: [DEFAULT_PROJECT_ENGINE],
      usingDefault: true,
    });
    expect(
      projectEngineSelection([{ enabled: true, engine: "claude", source: "model_api" }]),
    ).toEqual({ enabled: [DEFAULT_PROJECT_ENGINE], usingDefault: true });
  });

  it("replaces the default with the stored enabled pairs, even when none are on", () => {
    expect(
      projectEngineSelection([
        { enabled: false, engine: "chat_gpt", source: "consumer_scrape" },
        { enabled: true, engine: "gemini", source: "consumer_scrape" },
        { enabled: true, engine: "chat_gpt", source: "model_api" },
        { enabled: true, engine: "google", source: "google_aio" },
      ]).enabled,
    ).toEqual([
      { engine: "gemini", source: "consumer_scrape" },
      { engine: "chat_gpt", source: "model_api" },
    ]);
    expect(
      projectEngineSelection([{ enabled: false, engine: "chat_gpt", source: "consumer_scrape" }]),
    ).toEqual({ enabled: [], usingDefault: false });
  });
});
