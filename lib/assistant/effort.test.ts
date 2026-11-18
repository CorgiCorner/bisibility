import { expect, test } from "vitest";
import { resolveAssistantEffort, runAssistantEffort } from "./effort";
import { parseAssistantModels } from "./model-config";
import { turnRequestSchema } from "./wire";

const base = {
  id: "m",
  provider: "anthropic",
  providerModel: "claude",
  label: "Claude",
  toolUse: true,
  maxOutputTokens: 100,
  contextChars: 1000,
  pricing: {
    version: "v",
    inputMicroUsdPerMTok: 1,
    cachedInputMicroUsdPerMTok: 1,
    cacheWriteMicroUsdPerMTok: 1,
    outputMicroUsdPerMTok: 1,
  },
};
const parse = (extra: Record<string, unknown>) =>
  parseAssistantModels(JSON.stringify([{ ...base, ...extra }]));

test("the catalog validates efforts per model and provider", () => {
  expect(parse({})?.[0]?.efforts).toBeUndefined();
  expect(parse({ efforts: [] })).not.toBeNull();
  expect(parse({ efforts: ["low", "max"], defaultEffort: "max" })?.[0]).toMatchObject({
    efforts: ["low", "max"],
    defaultEffort: "max",
  });
  expect(parse({ efforts: ["low", "max"] })).toBeNull();
  expect(parse({ efforts: ["low"], defaultEffort: "high" })).toBeNull();
  expect(parse({ efforts: [], defaultEffort: "low" })).toBeNull();
  expect(parse({ efforts: ["low", "low"], defaultEffort: "low" })).toBeNull();
  expect(parse({ efforts: ["none"], defaultEffort: "none" })).toBeNull();
  expect(parse({ efforts: ["turbo"], defaultEffort: "turbo" })).toBeNull();
  expect(parse({ provider: "openrouter", efforts: ["max"], defaultEffort: "max" })).toBeNull();
  expect(
    parse({ provider: "openai", efforts: ["none", "max"], defaultEffort: "none" }),
  ).not.toBeNull();
});

test("a turn effort defaults to the model and must be one the model offers", () => {
  const reasoning = { efforts: ["low", "high"] as const, defaultEffort: "high" as const };
  expect(resolveAssistantEffort(reasoning, undefined)).toBe("high");
  expect(resolveAssistantEffort(reasoning, "low")).toBe("low");
  expect(resolveAssistantEffort(reasoning, "max")).toBeUndefined();
  expect(resolveAssistantEffort({}, undefined)).toBeNull();
  expect(resolveAssistantEffort({ efforts: [] }, "low")).toBeUndefined();
  const turn = (effort: string) =>
    turnRequestSchema.safeParse({
      project: "prj_test",
      conversationId: null,
      requestId: crypto.randomUUID(),
      text: "hi",
      modelId: "m",
      effort,
    }).success;
  expect(turn("xhigh")).toBe(true);
  expect(turn("extreme")).toBe(false);
});

test("a run keeps its stored effort only while the model still offers it", () => {
  const reasoning = { efforts: ["low", "high"] as const, defaultEffort: "high" as const };
  expect(runAssistantEffort(reasoning, "low")).toBe("low");
  expect(runAssistantEffort({}, null)).toBeNull();
  expect(() => runAssistantEffort(reasoning, "max")).toThrow(
    expect.objectContaining({ code: "model_unavailable" }),
  );
  expect(() => runAssistantEffort(reasoning, "garbage")).toThrow(
    expect.objectContaining({ code: "model_unavailable" }),
  );
  expect(() => runAssistantEffort({}, "low")).toThrow(
    expect.objectContaining({ code: "model_unavailable" }),
  );
});
