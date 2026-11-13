import { describe, expect, it } from "vitest";
import { HISTORICAL_DRAWER_ENGINE, resolveDrawerEngine } from "./drawer-engine-default";

describe("drawer engine default", () => {
  const project = { engine: "gemini" as const, source: "consumer_scrape" as const };
  const preset = { engine: "chat_gpt" as const, source: "model_api" as const };
  const saved = { engine: "google", source: "google_aio" };

  it("keeps the historical pair when the project has not stored a choice", () => {
    expect(resolveDrawerEngine({})).toEqual(HISTORICAL_DRAWER_ENGINE);
    expect(HISTORICAL_DRAWER_ENGINE).toEqual({ engine: "chat_gpt", source: "consumer_scrape" });
  });

  it("preselects the project engine, then a preset, then a saved schedule", () => {
    expect(resolveDrawerEngine({ project })).toEqual(project);
    expect(resolveDrawerEngine({ preset, project })).toEqual(preset);
    expect(resolveDrawerEngine({ preset, project, saved })).toEqual(saved);
  });
});
