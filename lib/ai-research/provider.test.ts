import { ProviderCallError } from "@/lib/providers/call-error";
import { testUsageObserver } from "@/lib/providers/usage-test-observer";
import { afterEach, describe, expect, it, vi } from "vitest";
import { modelMap } from "./catalog-fixtures.test-support";
import {
  aiProviderRequest,
  fetchEnginePrompt,
  fetchObserved,
  fetchPrompt,
  VISIBILITY_PATH,
} from "./provider";
import { promptSchema, visibilitySchema } from "./schema";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/providers/live-capacity", () => ({
  reserveLiveResponseCapacity: vi.fn(),
  assertLiveResponseCapacity: vi.fn(),
}));
afterEach(() => vi.unstubAllGlobals());
describe("AI provider request accounting", () => {
  it("uses catalog reasoning capabilities and omits unsupported temperature", async () => {
    const fetch = vi.fn().mockResolvedValue(
      Response.json({
        status_code: 20000,
        cost: 0.001,
        tasks: [
          {
            id: "response",
            status_code: 20000,
            cost: 0.001,
            result: [
              {
                model_name: "catalog-reasoning",
                items: [
                  { type: "reasoning", sections: [{ text: "summary" }] },
                  { type: "message", sections: [{ text: "Acme", annotations: null }] },
                ],
              },
            ],
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetch);
    const input = promptSchema.parse({
      brand: "Acme",
      domain: "acme.com",
      prompt: "Same question",
      models: ["catalog-reasoning"],
      max_cost_cents: 20,
      response_language: "pl",
      max_output_tokens: 1024,
    });
    const models = new Map([
      [
        "catalog-reasoning",
        {
          id: "catalog-reasoning",
          provider: "chat_gpt" as const,
          label: "Catalog reasoning",
          reasoning: true,
          webSearch: true,
          minOutputTokens: 1024,
          maxOutputTokens: 4096,
          priceAvailable: true,
          admissionEnabled: false,
          actualCostEnabled: true,
        },
      ],
    ]);
    const result = await fetchPrompt(
      { login: "fixture", password: "fictional", usageObserver: testUsageObserver },
      input,
      "catalog-reasoning",
      "tag",
      Date.now() + 120_000,
      models,
    );
    const payload = JSON.parse(fetch.mock.calls[0][1].body)[0];
    expect(payload).toMatchObject({
      user_prompt: "Same question",
      model_name: "catalog-reasoning",
      max_output_tokens: 1024,
      web_search: false,
    });
    expect(payload).not.toHaveProperty("temperature");
    expect(payload).not.toHaveProperty("language_code");
    expect(payload.system_message).toContain("pl");
    expect(result.row.answer).toBe("Acme");
  });
  it("sends web search country as a hint and rejects unsupported model options without dispatch", async () => {
    const fetch = vi.fn().mockResolvedValue(
      Response.json({
        status_code: 20000,
        cost: 0.001,
        tasks: [
          {
            id: "response",
            status_code: 20000,
            cost: 0.001,
            result: [
              {
                model_name: "gpt-4.1-mini",
                items: [{ type: "message", sections: [{ text: "Acme", annotations: [] }] }],
              },
            ],
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetch);
    const input = promptSchema.parse({
      brand: "Acme",
      domain: "acme.com",
      prompt: "Same question",
      models: ["gpt-4.1-mini"],
      max_cost_cents: 20,
      web_search: true,
      country_iso_code: "PL",
      max_output_tokens: 4096,
    });
    await fetchPrompt(
      { login: "fixture", password: "fictional", usageObserver: testUsageObserver },
      input,
      "gpt-4.1-mini",
      "tag",
      Date.now() + 120_000,
      modelMap,
    );
    expect(JSON.parse(fetch.mock.calls[0][1].body)[0]).toMatchObject({
      web_search: true,
      web_search_country_iso_code: "PL",
      max_output_tokens: 4096,
    });
    fetch.mockClear();
    const unsupported = new Map([
      ["gpt-4.1-mini", { ...modelMap.get("gpt-4.1-mini"), webSearch: false }],
    ]);
    await expect(
      fetchPrompt(
        { login: "fixture", password: "fictional", usageObserver: testUsageObserver },
        input,
        "gpt-4.1-mini",
        "tag",
        Date.now() + 120_000,
        unsupported as typeof modelMap,
      ),
    ).rejects.toThrow("unsupported");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("settles the actual receipt before returning results", async () => {
    const settle = vi.fn();
    const fetch = vi.fn().mockResolvedValue(
      Response.json({
        status_code: 20000,
        cost: 0.103,
        tasks: [
          {
            id: "request-1",
            status_code: 20000,
            cost: 0.103,
            result: [{ total_count: 0, items: [] }],
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetch);
    const result = await fetchObserved(
      {
        login: "test",
        password: "secret",
        usageObserver: { begin: vi.fn().mockResolvedValue("attempt-1"), settle },
      },
      visibilitySchema.parse({ brand: "Acme", domain: "acme.com", max_cost_cents: 20, limit: 3 }),
      "tag",
    );
    expect(result.costCents).toBeCloseTo(10.3);
    expect(settle).toHaveBeenCalledWith(
      "attempt-1",
      expect.objectContaining({ costCents: 10.3, providerRequestId: "request-1" }),
    );
    expect(fetch.mock.calls[0][0]).toContain("search_mentions/live");
  });
  it.each(["observed", "prompt"])(
    "preserves settled cost for malformed %s content",
    async (kind) => {
      const settle = vi.fn();
      const dispatched = vi.fn();
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
          Response.json({
            status_code: 20000,
            cost: 0.103,
            tasks: [
              {
                id: "malformed",
                status_code: 20000,
                cost: 0.103,
                result: [{ items: [{ sections: "malformed" }], total_count: 1 }],
              },
            ],
          }),
        ),
      );
      const credentials = {
        login: "test",
        password: "secret",
        usageObserver: { begin: vi.fn().mockResolvedValue("attempt"), settle },
      };
      const target = { brand: "Acme", domain: "acme.com", max_cost_cents: 60 };
      const request =
        kind === "observed"
          ? fetchObserved(
              credentials,
              visibilitySchema.parse(target),
              "tag",
              Date.now() + 40_000,
              dispatched,
            )
          : fetchPrompt(
              credentials,
              promptSchema.parse({ ...target, prompt: "q", models: ["gpt-4.1-mini"] }),
              "gpt-4.1-mini",
              "tag",
              Date.now() + 40_000,
              modelMap,
              dispatched,
            );
      const error = await request.catch((failure: unknown) => failure);
      expect(error).toBeInstanceOf(ProviderCallError);
      expect(error).toMatchObject({ costCents: 10.3 });
      expect(dispatched).toHaveBeenCalledTimes(1);
      expect(settle).toHaveBeenCalledWith("attempt", expect.objectContaining({ costCents: 10.3 }));
    },
  );
  it("does not replay a request after ambiguous acceptance", async () => {
    const fetch = vi.fn().mockRejectedValue(new TypeError("connection lost"));
    const settle = vi.fn();
    vi.stubGlobal("fetch", fetch);
    await expect(
      aiProviderRequest(
        {
          login: "test",
          password: "secret",
          usageObserver: { begin: vi.fn().mockResolvedValue("attempt"), settle },
        },
        VISIBILITY_PATH,
        {},
      ),
    ).rejects.toThrow("usage could not be confirmed");
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(settle).toHaveBeenCalledWith(
      "attempt",
      expect.objectContaining({ costCents: null, failed: true }),
    );
  });
  it("does not start paid I/O after the aggregate deadline", async () => {
    const fetch = vi.fn();
    const begin = vi.fn();
    vi.stubGlobal("fetch", fetch);
    await expect(
      aiProviderRequest(
        { login: "test", password: "secret", usageObserver: { begin, settle: vi.fn() } },
        VISIBILITY_PATH,
        {},
        Date.now() - 1,
      ),
    ).rejects.toThrow("deadline");
    expect(fetch).not.toHaveBeenCalled();
    expect(begin).not.toHaveBeenCalled();
  });
  it("aborts the actual paid request at the aggregate deadline and keeps usage unknown", async () => {
    const settle = vi.fn();
    let requestSignal: AbortSignal | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(
        (_url, init) =>
          new Promise((_resolve, reject) => {
            requestSignal = init.signal;
            init.signal.addEventListener(
              "abort",
              () => reject(new DOMException("Aborted", "AbortError")),
              { once: true },
            );
          }),
      ),
    );
    await expect(
      aiProviderRequest(
        {
          login: "test",
          password: "secret",
          usageObserver: { begin: vi.fn().mockResolvedValue("deadline-attempt"), settle },
        },
        VISIBILITY_PATH,
        {},
        Date.now() + 20,
      ),
    ).rejects.toThrow("usage could not be confirmed");
    expect(requestSignal?.aborted).toBe(true);
    expect(settle).toHaveBeenCalledWith(
      "deadline-attempt",
      expect.objectContaining({ costCents: null, failed: true }),
    );
  });
  it("fails closed when provider omits cost evidence", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          Response.json({ status_code: 20000, tasks: [{ status_code: 20000, result: [] }] }),
        ),
    );
    await expect(
      aiProviderRequest(
        { login: "test", password: "secret", usageObserver: testUsageObserver },
        VISIBILITY_PATH,
        {},
      ),
    ).rejects.toThrow("usage could not be confirmed");
  });
});

describe("engine-mode provider requests (ADR-023)", () => {
  const response = (model: string) =>
    Response.json({
      status_code: 20000,
      cost: 0.07,
      tasks: [
        {
          id: "engine-response",
          status_code: 20000,
          cost: 0.07,
          result: [
            {
              model_name: model,
              items: [{ type: "message", sections: [{ text: "Acme", annotations: null }] }],
            },
          ],
        },
      ],
    });
  const credentials = { login: "fixture", password: "fictional", usageObserver: testUsageObserver };
  const input = (extra: Record<string, unknown> = {}) =>
    promptSchema.parse({
      brand: "Acme",
      domain: "acme.com",
      prompt: "Same question",
      max_cost_cents: 20,
      engines: ["claude"],
      ...extra,
    });
  const engine = (overrides: Record<string, unknown> = {}) => ({
    engine: "claude" as const,
    model: "claude-sonnet-5",
    outputTokens: 1024,
    costCents: 7.5,
    measuredAt: "2026-10-23T10:00:00Z",
    reasoning: false,
    ...overrides,
  });

  it("posts the calibrated model to its engine path with web_search only", async () => {
    const fetch = vi.fn().mockResolvedValue(response("claude-sonnet-5"));
    vi.stubGlobal("fetch", fetch);
    const result = await fetchEnginePrompt(
      credentials,
      input({ web_search: true, country_iso_code: "DE" }),
      engine(),
      "tag",
      Date.now() + 120_000,
    );
    expect(fetch.mock.calls[0][0]).toBe(
      "https://api.dataforseo.com/v3/ai_optimization/claude/llm_responses/live",
    );
    const payload = JSON.parse(fetch.mock.calls[0][1].body)[0];
    expect(payload).toMatchObject({
      model_name: "claude-sonnet-5",
      max_output_tokens: 1024,
      web_search: true,
      temperature: 0,
    });
    expect(payload).not.toHaveProperty("force_web_search");
    expect(payload).not.toHaveProperty("web_search_country_iso_code");
    expect(result.row).toMatchObject({ engine: "claude", requestedModel: "claude-sonnet-5" });
  });

  it("keeps the country hint for ChatGPT and omits temperature for reasoning models", async () => {
    const fetch = vi.fn().mockResolvedValue(response("gpt-5.6-luna"));
    vi.stubGlobal("fetch", fetch);
    await fetchEnginePrompt(
      credentials,
      input({ engines: ["chat_gpt"], web_search: true, country_iso_code: "DE" }),
      engine({ engine: "chat_gpt", model: "gpt-5.6-luna", reasoning: true }),
      "tag",
      Date.now() + 120_000,
    );
    const payload = JSON.parse(fetch.mock.calls[0][1].body)[0];
    expect(payload).toMatchObject({ web_search_country_iso_code: "DE", web_search: true });
    expect(payload).not.toHaveProperty("temperature");
  });
});

describe("AI provider domain is limited independently of local citation matching", () => {
  const domain = [
    "a".repeat(63),
    "b".repeat(63),
    "c".repeat(63),
    "d".repeat(49),
    "example",
    "com",
  ].join(".");
  const common = { brand: "Example", domain, max_cost_cents: 20 };
  const credentials = { login: "fixture", password: "fictional", usageObserver: testUsageObserver };
  it("sends brand searches without a provider domain and preserves long-host citations", async () => {
    const fetch = vi.fn().mockResolvedValue(
      Response.json({
        status_code: 20000,
        cost: 0.001,
        tasks: [
          {
            id: "brand",
            status_code: 20000,
            cost: 0.001,
            result: [
              {
                total_count: 1,
                items: [
                  {
                    question: "q",
                    answer: "Example",
                    model_name: "chat_gpt",
                    sources: [{ url: `https://${domain}/page` }],
                  },
                ],
              },
            ],
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetch);
    const result = await fetchObserved(
      credentials,
      visibilitySchema.parse({ ...common, target_type: "brand" }),
      "tag",
    );
    const payload = JSON.parse(fetch.mock.calls[0][1].body)[0];
    expect(payload.target).toEqual([
      {
        keyword: "Example",
        search_filter: "include",
        search_scope: ["answer"],
        match_type: "word_match",
      },
    ]);
    expect(result.rows[0].domainCited).toBe(true);
    expect(result.rows[0].citations[0].url).toBe(`https://${domain}/page`);
  });
  it("sends prompt requests without any provider domain and preserves matching identity", async () => {
    const fetch = vi.fn().mockResolvedValue(
      Response.json({
        status_code: 20000,
        cost: 0.001,
        tasks: [
          {
            id: "prompt",
            status_code: 20000,
            cost: 0.001,
            result: [
              {
                model_name: "gpt-4.1-mini",
                items: [
                  {
                    type: "message",
                    sections: [
                      { text: "Example", annotations: [{ url: `https://${domain}/page` }] },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetch);
    const result = await fetchPrompt(
      credentials,
      promptSchema.parse({ ...common, prompt: "q", models: ["gpt-4.1-mini"] }),
      "gpt-4.1-mini",
      "tag",
      Date.now() + 120000,
      modelMap,
    );
    const payload = JSON.parse(fetch.mock.calls[0][1].body)[0];
    expect(payload).not.toHaveProperty("domain");
    expect(payload).not.toHaveProperty("target");
    expect(result.row.domainCited).toBe(true);
    expect(result.row.citations[0].url).toBe(`https://${domain}/page`);
  });
  it("refuses an unchecked overlong domain before dispatch, without truncating it", async () => {
    const fetch = vi.fn().mockResolvedValue(
      Response.json({
        status_code: 20000,
        tasks: [{ status_code: 20000, cost: 0, result: [{ items: [] }] }],
      }),
    );
    const dispatch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const valid = visibilitySchema.parse({
      brand: "Example",
      domain: "example.com",
      max_cost_cents: 20,
    });
    await expect(
      fetchObserved(credentials, { ...valid, domain }, "tag", Date.now() + 120000, dispatch),
    ).rejects.toThrow(/Domain searches support at most 63 characters/);
    expect(fetch).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
  });
});

describe("provider-only www normalization", () => {
  const bare = `${"a".repeat(50)}.${"b".repeat(8)}.com`;
  const credentials = { login: "fixture", password: "fictional", usageObserver: testUsageObserver };
  it.each(["example.com", bare])(
    "strips www only in the outbound domain filter for %s",
    async (host) => {
      const domain = `www.${host}`;
      const fetch = vi.fn().mockResolvedValue(
        Response.json({
          status_code: 20000,
          cost: 0.001,
          tasks: [
            {
              id: "fixture",
              status_code: 20000,
              cost: 0.001,
              result: [
                {
                  items: [domain, host].map((citationHost) => ({
                    question: "q",
                    answer: "Example",
                    model_name: "chat_gpt",
                    sources: [{ url: `https://${citationHost}/page` }],
                  })),
                },
              ],
            },
          ],
        }),
      );
      vi.stubGlobal("fetch", fetch);
      const input = visibilitySchema.parse({ brand: "Example", domain, max_cost_cents: 20 });
      const result = await fetchObserved(credentials, input, "tag");
      expect(JSON.parse(fetch.mock.calls[0][1].body)[0].target).toEqual([
        {
          domain: host,
          search_filter: "include",
          search_scope: ["sources"],
          include_subdomains: true,
        },
      ]);
      expect(input.domain).toBe(domain);
      expect(result.rows.map((row) => row.domainCited)).toEqual([true, false]);
    },
  );
  it.each([`${bare}x`, `www.${bare}x`])(
    "rejects oversized actual provider field before I/O: %s",
    async (domain) => {
      const fetch = vi.fn();
      const dispatch = vi.fn();
      vi.stubGlobal("fetch", fetch);
      const valid = visibilitySchema.parse({
        brand: "Example",
        domain: "example.com",
        max_cost_cents: 20,
      });
      await expect(
        fetchObserved(credentials, { ...valid, domain }, "tag", Date.now() + 120000, dispatch),
      ).rejects.toThrow(/63 characters/);
      expect(fetch).not.toHaveBeenCalled();
      expect(dispatch).not.toHaveBeenCalled();
    },
  );
});
