import { afterEach, expect, test, vi } from "vitest";
import { assistantEnabled } from "./access";
import type { AssistantModel } from "./model-config";
import { streamAssistantProvider } from "./provider";
import { assistantPromptBody } from "./provider-prompt";
import type { ProviderRequest } from "./provider-types";

vi.mock("@/lib/db/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/auth/session", () => ({ getOptionalAvailableSession: async () => null }));

const GET_PROJECT = {
  name: "get_project",
  title: "Get project",
  description: "Read the project.",
  inputSchema: { type: "object", properties: {} },
} as unknown as Parameters<typeof assistantPromptBody>[3][number];
const model: AssistantModel = {
  id: "fixture",
  provider: "openai",
  providerModel: "fixture",
  label: "Fixture",
  toolUse: true,
  maxOutputTokens: 100,
  contextChars: 10000,
  pricing: {
    version: "v",
    inputMicroUsdPerMTok: 1,
    cachedInputMicroUsdPerMTok: 1,
    cacheWriteMicroUsdPerMTok: 1,
    outputMicroUsdPerMTok: 1,
  },
};

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
function request(
  provider: "openai" | "anthropic" | "openrouter",
  text: string,
  result = false,
): ProviderRequest {
  return {
    provider,
    model: "fixture",
    apiKey: "fixture",
    funding: "byok",
    body: assistantPromptBody(
      { ...model, provider },
      "system",
      [
        { type: "user", text },
        ...(result
          ? [
              { type: "tool_call" as const, id: "call", name: "get_project", argumentsJson: "{}" },
              { type: "tool_result" as const, id: "call", result: {} },
            ]
          : []),
      ],
      [GET_PROJECT],
    ),
    effort: null,
    signal: new AbortController().signal,
    timeoutMs: 500,
  };
}
async function collect(input: ProviderRequest) {
  const events = [];
  for await (const event of streamAssistantProvider(input)) events.push(event);
  return events;
}
for (const provider of ["openai", "anthropic", "openrouter"] as const) {
  test(`${provider} local fixture streams markdown and a metered read, with no repeat after result`, async () => {
    vi.stubEnv("ASSISTANT_DEV_FAKE_PROVIDER", "1");
    vi.stubEnv("NODE_ENV", "test");
    const fetch = vi.fn(() => {
      throw new Error("Unexpected provider network call");
    });
    vi.stubGlobal("fetch", fetch);
    const events = await collect(request(provider, "Show keyword rankings"));
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "tool-call", name: "get_project" }),
        expect.objectContaining({ type: "usage" }),
        expect.objectContaining({ type: "finish" }),
      ]),
    );
    const markdown = events
      .filter((e) => e.type === "text-delta")
      .map((e) => e.text)
      .join("");
    expect(markdown).toContain("# Project assistant");
    expect(markdown).toContain("```text");
    expect(markdown).toContain("| Metric | Value |");
    expect(markdown).toContain("https://example.test/a/long/path");
    expect(
      (await collect(request(provider, "Show keyword rankings", true))).some(
        (e) => e.type === "tool-call",
      ),
    ).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });
  test(`${provider} proposes writes and paid research`, async () => {
    vi.stubEnv("ASSISTANT_DEV_FAKE_PROVIDER", "1");
    vi.stubEnv("NODE_ENV", "test");
    expect(await collect(request(provider, "add keywords"))).toContainEqual(
      expect.objectContaining({ type: "tool-call", name: "add_keywords" }),
    );
    expect(await collect(request(provider, "research keywords"))).toContainEqual(
      expect.objectContaining({ type: "tool-call", name: "research_keywords" }),
    );
  });
}
test("a positive delay enables the fixture without a network call", async () => {
  vi.stubEnv("ASSISTANT_DEV_FAKE_PROVIDER", "40");
  vi.stubEnv("NODE_ENV", "test");
  const fetch = vi.fn(() => {
    throw new Error("Unexpected provider network call");
  });
  vi.stubGlobal("fetch", fetch);
  expect(await collect(request("openai", "keywords"))).toEqual(
    expect.arrayContaining([expect.objectContaining({ type: "usage" })]),
  );
  expect(fetch).not.toHaveBeenCalled();
});
test("production rejects the fake provider without a network call", async () => {
  vi.stubEnv("ASSISTANT_DEV_FAKE_PROVIDER", "25");
  vi.stubEnv("NODE_ENV", "production");
  const fetch = vi.fn(() => {
    throw new Error("Unexpected provider network call");
  });
  vi.stubGlobal("fetch", fetch);
  expect(await collect(request("openai", "keywords"))).toEqual([
    { type: "error", code: "not_configured", rejected: true },
  ]);
  expect(fetch).not.toHaveBeenCalled();
  vi.stubEnv("ASSISTANT_ENABLED", "1");
  expect(assistantEnabled()).toBe(false);
});
test("an already aborted fixture does not emit usage", async () => {
  vi.stubEnv("ASSISTANT_DEV_FAKE_PROVIDER", "1");
  vi.stubEnv("NODE_ENV", "test");
  const controller = new AbortController();
  controller.abort();
  expect(await collect({ ...request("openai", "keywords"), signal: controller.signal })).toEqual([
    { type: "error", code: "cancelled", rejected: true },
  ]);
});

test("fixture acknowledges a denied action without another tool call", async () => {
  vi.stubEnv("ASSISTANT_DEV_FAKE_PROVIDER", "1");
  vi.stubEnv("NODE_ENV", "test");
  const input = request("openai", "add keywords");
  input.body = assistantPromptBody(
    model,
    "system",
    [
      { type: "user", text: "add keywords" },
      { type: "tool_call", id: "call", name: "add_keywords", argumentsJson: "{}" },
      { type: "tool_result", id: "call", result: { denied: true } },
    ],
    [GET_PROJECT],
  );
  const events = await collect(input);
  expect(events).toContainEqual(
    expect.objectContaining({ type: "text-delta", text: expect.stringContaining("was denied") }),
  );
  expect(events.some((event) => event.type === "tool-call")).toBe(false);
});

test("each local fixture call gets a distinct request id", async () => {
  vi.stubEnv("ASSISTANT_DEV_FAKE_PROVIDER", "1");
  vi.stubEnv("NODE_ENV", "test");
  vi.stubGlobal("fetch", () => {
    throw new Error("Unexpected provider network call");
  });
  const ids = [];
  for (let step = 0; step < 2; step += 1) {
    const events = await collect(request("openrouter", "hello"));
    const usage = events.find((event) => event.type === "usage");
    if (usage?.type !== "usage") throw new Error("Missing usage");
    ids.push(usage.requestId);
  }
  expect(ids[0]).not.toBe("development-fixture");
  expect(ids[0]).not.toBe(ids[1]);
});
