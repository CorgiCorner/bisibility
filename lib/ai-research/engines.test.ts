import { describe, expect, it } from "vitest";
import {
  AI_ENGINES,
  engineCatalogPath,
  engineResponsePath,
  engineSearchParameters,
  isAiEngine,
} from "./engines";

describe("AI response engines", () => {
  it("lists engines in provider order", () => {
    expect(AI_ENGINES).toEqual(["chat_gpt", "claude", "gemini", "perplexity"]);
  });

  it("builds the live response and model catalog paths", () => {
    expect(engineResponsePath("claude")).toBe("claude/llm_responses/live");
    expect(engineCatalogPath("perplexity")).toBe("perplexity/llm_responses/models");
  });

  it("accepts only registered engines", () => {
    expect(isAiEngine("google")).toBe(false);
    expect(isAiEngine("gemini")).toBe(true);
  });

  it("sets search parameters per engine", () => {
    expect(engineSearchParameters("perplexity", true)).toEqual({ web_search: true });
    expect(engineSearchParameters("perplexity", false)).toEqual({ web_search: true });
    expect(engineSearchParameters("claude", true)).toEqual({ web_search: true });
    expect(engineSearchParameters("claude", false)).toEqual({ web_search: false });
    expect(engineSearchParameters("chat_gpt", true)).toEqual({ web_search: true });
    expect(engineSearchParameters("chat_gpt", false)).toEqual({ web_search: false });
  });
});
