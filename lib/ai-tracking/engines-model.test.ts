import { toggleableProjectEngines } from "@/lib/ai-tracking/project-engine-set";
import { PROVIDER_CATALOG } from "@/lib/providers/catalog-metadata";
import { describe, expect, it } from "vitest";
import { aiVisibilityProviders, buildEnginesPageModel, enginePriceLabel } from "./engines-model";

const toggleable = toggleableProjectEngines();

describe("engine price labels", () => {
  const card = { usdByEngine: { chat_gpt: 0.12, gemini: 0.08 } };

  it("hides a price the card does not have and never prices a model API from the scraper bound", () => {
    expect(
      enginePriceLabel({ availability: "toggle", engine: "chat_gpt", source: "model_api" }, card),
    ).toEqual({ kind: "by_length" });
    expect(
      enginePriceLabel(
        { availability: "toggle", engine: "chat_gpt", source: "consumer_scrape" },
        card,
      ),
    ).toEqual({ kind: "usd", usd: 0.12 });
    expect(
      enginePriceLabel(
        { availability: "toggle", engine: "gemini", source: "consumer_scrape" },
        { usdByEngine: {} },
      ),
    ).toEqual({ kind: "dash" });
    expect(enginePriceLabel({ availability: "unavailable" }, card)).toEqual({ kind: "none" });
    expect(enginePriceLabel({ availability: "rank_tracker" }, { usdByEngine: {} })).toEqual({
      kind: "free",
    });
  });
});

describe("engines page model", () => {
  it("lists only catalog providers and a row for every toggleable engine", () => {
    expect(aiVisibilityProviders()).toEqual(["dataforseo"]);
    expect(
      aiVisibilityProviders().every((id) => PROVIDER_CATALOG.some((entry) => entry.id === id)),
    ).toBe(true);
    const model = buildEnginesPageModel({
      canWrite: true,
      connected: true,
      enabled: [{ engine: "gemini", source: "consumer_scrape" }],
      hasRankChecks: true,
      prices: { usdByEngine: { gemini: 0.08 } },
      recentByEngine: { "consumer_scrape:gemini": 4, "google_aio:google": 2 },
      toggleable,
    });
    expect(model.providers).toEqual([{ connected: true, id: "dataforseo" }]);
    const toggles = model.rows.filter((row) => row.kind === "row" && row.availability === "toggle");
    expect(toggles.map((row) => ("source" in row ? `${row.source}:${row.engine}` : ""))).toEqual(
      toggleable.map((pair) => `${pair.source}:${pair.engine}`),
    );
    const unavailable = model.rows.filter(
      (row) => row.kind === "row" && row.availability === "unavailable",
    );
    expect(unavailable.map((row) => row.id)).toEqual([
      "perplexity",
      "google_ai_mode",
      "bing_copilot",
    ]);
    expect(unavailable.every((row) => row.kind === "row" && row.price.kind === "none")).toBe(true);
    const rank = model.rows.find((row) => row.kind === "row" && row.id === "google_ai_overview");
    expect(rank).toMatchObject({ availability: "rank_tracker", on: true, price: { kind: "free" } });
    const gemini = model.rows.find((row) => row.id === "consumer_scrape:gemini");
    expect(gemini).toMatchObject({
      enabled: true,
      price: { kind: "usd", usd: 0.08 },
      recentAnswers: 4,
    });
    const chatgpt = model.rows.find((row) => row.id === "consumer_scrape:chat_gpt");
    expect(chatgpt).toMatchObject({ enabled: false, price: { kind: "dash" } });
    const modelApi = model.rows.find((row) => row.id === "model_api:chat_gpt");
    expect(modelApi).toMatchObject({ price: { kind: "by_length" } });
  });
});
