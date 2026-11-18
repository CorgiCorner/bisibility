import { describe, expect, it } from "vitest";
import type { AssistantConfigView, ModelView } from "../wire";
import { composerChoice, modelsByProvider } from "./composer-choice";

const model = (
  id: string,
  provider: ModelView["provider"],
  efforts: ModelView["efforts"] = [],
): ModelView => ({
  id,
  provider,
  label: id,
  toolUse: true,
  efforts,
  defaultEffort: efforts.includes("medium") ? "medium" : (efforts[0] ?? null),
  maxOutputTokens: 8192,
});

const config = {
  enabled: true,
  reason: null,
  project: { publicId: "prj", name: "Project", role: "owner", readOnly: false },
  models: [
    model("sonnet", "anthropic", ["low", "medium", "high"]),
    model("gpt", "openai", ["none", "low"]),
    model("deepseek", "openrouter"),
    { ...model("no-tools", "openai"), toolUse: false },
  ],
  funding: [
    {
      mode: "credits",
      provider: "anthropic",
      available: true,
      reason: null,
      usage: null,
      credential: null,
    },
    {
      mode: "byok",
      provider: "openai",
      available: false,
      reason: "byok_missing",
      usage: null,
      credential: null,
    },
  ],
  fundingPreference: [{ provider: "openai", mode: "byok" }],
  creditsEnabled: true,
  defaults: { modelId: "sonnet", funding: null },
  starters: [],
  limits: { maxUserTextChars: 8000, maxSteps: 6 },
} satisfies AssistantConfigView;

describe("composerChoice", () => {
  it("uses the stored model and effort when the catalog still offers them", () => {
    const choice = composerChoice(config, {
      modelId: "gpt",
      effort: "none",
      maxOutputTokens: null,
    });
    expect(choice.model?.id).toBe("gpt");
    expect(choice.effort).toBe("none");
    expect(choice.funding).toEqual({ provider: "openai", mode: "byok" });
    expect(choice.fundingBlocked).toBe(true);
  });

  it("falls back to the project default model and that model's default effort", () => {
    const choice = composerChoice(config, {
      modelId: "gone",
      effort: "max",
      maxOutputTokens: null,
    });
    expect(choice.model?.id).toBe("sonnet");
    expect(choice.effort).toBe("medium");
    expect(choice.funding).toEqual({ provider: "anthropic", mode: "credits" });
    expect(choice.fundingBlocked).toBe(false);
  });

  it("has no effort for a model without reasoning levels and hides tool-less models", () => {
    const choice = composerChoice(config, {
      modelId: "deepseek",
      effort: "low",
      maxOutputTokens: null,
    });
    expect(choice.effort).toBeNull();
    expect(choice.models.map((item) => item.id)).toEqual(["sonnet", "gpt", "deepseek"]);
  });

  it("offers token limits up to the model maximum and sends one only below it", () => {
    const pick = (maxOutputTokens: number | null) =>
      composerChoice(config, { modelId: "gpt", effort: null, maxOutputTokens });
    expect(pick(null).limits).toEqual([1024, 4096, 8192]);
    expect(pick(null).maxOutputTokens).toBeNull();
    expect(pick(4096).maxOutputTokens).toBe(4096);
    // The model maximum, or a stored limit above it, sends none: the server uses the maximum.
    expect(pick(8192).maxOutputTokens).toBeNull();
    expect(pick(16384).maxOutputTokens).toBeNull();
  });

  it("groups models by provider in catalog order", () => {
    expect(
      modelsByProvider(config.models).map((group) => [group.provider, group.models.length]),
    ).toEqual([
      ["anthropic", 1],
      ["openai", 2],
      ["openrouter", 1],
    ]);
  });
});
