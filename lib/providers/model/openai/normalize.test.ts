import { MODEL_PLAYGROUND_LIMITS, utf8Bytes } from "@/lib/model-playground/schema";
import { modelColumnResultSchema } from "@/lib/model-playground/types";
import {
  assertNoUnexpectedFetch,
  interceptedFetch,
} from "@/lib/providers/model/transport.test-support";
import { transportEvidence } from "@/lib/providers/model/transport-evidence";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { column, plainFixture, searchFixture } from "./adapter.test-support";
import { normalizeResponse } from "./normalize";

vi.mock("@/lib/providers/rate-limit", () => ({
  consumeProviderLimit: vi.fn(async () => ({ success: true })),
}));

beforeEach(() => {
  interceptedFetch();
});
afterEach(() => {
  assertNoUnexpectedFetch();
  vi.unstubAllGlobals();
});

function normalize(raw: unknown = plainFixture(), model = "gpt-4.1", calls = 0) {
  const selected = column(model);
  if (calls) selected.settings.search = { mode: "openai_web_search", maxCalls: calls };
  const normalized = normalizeResponse(raw, selected, calls);
  const result = { ...transportEvidence(selected, Date.now(), null), ...normalized };
  expect(modelColumnResultSchema.parse(JSON.parse(JSON.stringify(result)))).toEqual(result);
  return result;
}
const text = (value: string, annotations: unknown[] = []) => ({
  type: "output_text",
  text: value,
  annotations,
});
const message = (content: unknown[], id = "msg_synthetic") => ({
  id,
  type: "message",
  status: "completed",
  role: "assistant",
  content,
});
const citation = (start_index = 0, end_index = 1, url = "https://example.org/source") => ({
  type: "url_citation",
  start_index,
  end_index,
  url,
  title: "Synthetic source",
});

describe("retained native text and source identity", () => {
  it("preserves ordered output and content blocks and UTF-16 offsets across blocks", () => {
    const raw = {
      ...plainFixture(),
      output: [
        message([text("😀 first"), text("second [1]", [citation(7, 10)])]),
        { type: "reasoning", id: "rs_synthetic", summary: [{ text: "not an answer" }] },
        message([text("third [1]", [citation(6, 9)])], "msg_second"),
      ],
    };
    const result = normalize(raw, "gpt-4.1", 1);
    expect(result.answer).toBe("😀 first\nsecond [1]\nthird [1]");
    expect(result.citations.map(({ start, end }) => [start, end])).toEqual([
      [16, 19],
      [26, 29],
    ]);
    for (const item of result.citations)
      expect(result.answer?.slice(item.start ?? 0, item.end ?? 0)).toBe("[1]");
  });

  it("keeps repeated occurrences while deduplicating canonical URL identity", () => {
    const result = normalize(searchFixture(), "gpt-5", 1);
    expect(result.citations.map(({ start, end }) => [start, end])).toEqual([
      [6, 9],
      [17, 20],
    ]);
    expect(new Set(result.citations.map((item) => item.occurrenceId)).size).toBe(2);
    expect(new Set(result.citations.map((item) => item.sourceId)).size).toBe(1);
    expect(result.citations.map((item) => item.url)).toEqual([
      "https://example.org/source",
      "https://example.org/source",
    ]);
    expect(result.usage.searchCalls).toBe(1);
    expect(result.usage.searchContentTokens).toBeNull();
    expect(result.providerCost.amount).toBeNull();
  });

  it("retains citations with unknown ranges when upstream Unicode indexing units are ambiguous", () => {
    const result = normalize(
      { ...plainFixture(), output: [message([text("😀 [1]", [citation(3, 6)])])] },
      "gpt-4.1",
      1,
    );
    expect(result.answer).toBe("😀 [1]");
    expect(result.citations[0]).toMatchObject({ start: null, end: null });
  });

  it("bounds a Unicode citation title and explicitly marks citation truncation", () => {
    const annotation = { ...citation(), title: `${"a".repeat(511)}😀` };
    const result = normalize(
      { ...plainFixture(), output: [message([text("answer", [annotation])])] },
      "gpt-4.1",
      1,
    );
    expect(result.citations[0].title).toBe("a".repeat(511));
    expect(result).toMatchObject({ state: "partial", truncation: { citations: true } });
  });

  it("distinguishes search, open and find actions without deriving charges from their count", () => {
    const raw = searchFixture();
    const output: unknown[] = [
      ...raw.output,
      {
        type: "web_search_call",
        id: "ws_open",
        status: "completed",
        action: { type: "open_page", url: "https://example.org/source" },
      },
      {
        type: "web_search_call",
        id: "ws_find",
        status: "completed",
        action: { type: "find_in_page", url: "https://example.org/source", pattern: "synthetic" },
      },
    ];
    const result = normalize({ ...raw, output }, "gpt-5", 3);
    expect(result.usage).toMatchObject({
      completeness: "partial",
      searchCalls: 1,
      searchContentTokens: null,
    });
    expect(result.providerCost).toMatchObject({ amount: null, certainty: "unknown" });
  });

  it("retains the full UTF-8 bounded prefix without splitting a surrogate pair", () => {
    const long = `${"a".repeat(MODEL_PLAYGROUND_LIMITS.answerBytes - 1)}😀tail`;
    const result = normalize(
      { ...plainFixture(), output: [message([text(long), text("later", [citation()])])] },
      "gpt-4.1",
      1,
    );
    expect(result.answer).toBe("a".repeat(MODEL_PLAYGROUND_LIMITS.answerBytes - 1));
    expect(utf8Bytes(result.answer ?? "")).toBeLessThanOrEqual(MODEL_PLAYGROUND_LIMITS.answerBytes);
    expect(result).toMatchObject({
      state: "partial",
      truncation: { application: true, citations: true },
    });
    expect(result.citations).toHaveLength(0);
  });

  it("bounds occurrence and unique retained source totals at the P01 limit", () => {
    const annotations = Array.from({ length: 101 }, (_, i) =>
      citation(0, 1, `https://example.org/${i}`),
    );
    const result = normalize(
      { ...plainFixture(), output: [message([text("answer", annotations)])] },
      "gpt-4.1",
      1,
    );
    expect(result.citations).toHaveLength(100);
    expect(new Set(result.citations.map((item) => item.sourceId)).size).toBe(100);
    expect(result).toMatchObject({ state: "partial", truncation: { citations: true } });
  });

  it.each([
    [citation(1, 1)],
    [citation(0, 99)],
    [citation(0, 1, "https://user:pass@example.com")],
    [citation(0, 1, "javascript:alert(1)")],
    [
      { ...citation(), source_id: "same-source" },
      { ...citation(0, 1, "https://example.org/other"), source_id: "same-source" },
    ],
  ])("rejects malformed or conflicting source identities: %j", (...annotations) => {
    expect(() =>
      normalize(
        { ...plainFixture(), output: [message([text("answer", annotations)])] },
        "gpt-4.1",
        1,
      ),
    ).toThrow();
  });
});

describe("response status and model integrity", () => {
  it("fails unrequested positive search usage while retaining measured evidence", () => {
    const result = normalize({
      ...plainFixture(),
      tool_usage: { web_search: { num_requests: 1 } },
    });
    expect(result).toMatchObject({
      state: "failed",
      failure: "invalid_response",
      usage: {
        completeness: "partial",
        inputTokens: 100,
        outputTokens: 40,
        searchCalls: 1,
        searchContentTokens: null,
      },
      providerCost: { amount: null, certainty: "unknown", basis: "unknown" },
      paymentReceipt: null,
    });
  });

  it("accepts explicit zero search usage when search is disabled", () => {
    expect(
      normalize({ ...plainFixture(), tool_usage: { web_search: { num_requests: 0 } } }),
    ).toMatchObject({
      state: "completed",
      failure: null,
      usage: { completeness: "complete", searchCalls: 0, searchContentTokens: null },
    });
  });

  it("keeps requested search usage partial without inferring calls from output", () => {
    expect(
      normalize(
        { ...plainFixture(), tool_usage: { web_search: { num_requests: 1 } } },
        "gpt-4.1",
        1,
      ),
    ).toMatchObject({
      state: "completed",
      failure: null,
      usage: { completeness: "partial", searchCalls: 1, searchContentTokens: null },
    });
  });

  it.each(["gpt-4.1-new", "arbitrary prompt", "bad\nmodel", "", null])(
    "rejects unsupported or malformed actual model %j",
    (model) => {
      expect(() => normalize({ ...plainFixture(), model })).toThrow();
    },
  );

  it("does not resolve a pinned snapshot to an alias", () => {
    expect(normalize({ ...plainFixture(), model: "gpt-4.1" }, "gpt-4.1-2025-04-14")).toMatchObject({
      state: "failed",
      failure: "invalid_response",
      actualModelId: "gpt-4.1",
    });
  });

  it("retains a known mismatched actual model and token evidence without accepting substitution", () => {
    expect(normalize({ ...plainFixture(), model: "gpt-5-2025-08-07" })).toMatchObject({
      column: { modelId: "gpt-4.1" },
      actualModelId: "gpt-5-2025-08-07",
      state: "failed",
      failure: "invalid_response",
      usage: { inputTokens: 100, outputTokens: 40 },
    });
  });

  it("normalizes refusal without retaining its arbitrary explanation", () => {
    const result = normalize({
      ...plainFixture(),
      output: [message([{ type: "refusal", refusal: "SYNTHETIC-ARBITRARY-ECHO" }])],
    });
    expect(result).toMatchObject({ state: "failed", failure: "refused", answer: null });
    expect(JSON.stringify(result)).not.toContain("SYNTHETIC-ARBITRARY-ECHO");
    expect(result.usage.inputTokens).toBe(100);
  });

  it.each(["max_output_tokens", "max_messages", "steered"])(
    "marks incomplete %s as partial",
    (reason) => {
      expect(
        normalize({ ...plainFixture(), status: "incomplete", incomplete_details: { reason } }),
      ).toMatchObject({ state: "partial", truncation: { provider: true } });
    },
  );

  it("keeps token evidence for an incomplete answer with no visible text", () => {
    expect(
      normalize({
        ...plainFixture(),
        status: "incomplete",
        incomplete_details: { reason: "max_output_tokens" },
        output: [],
      }),
    ).toMatchObject({ state: "partial", answer: null, usage: { outputTokens: 40 } });
  });

  it("does not complete an answer with an unfinished reasoning item", () => {
    expect(
      normalize({
        ...plainFixture(),
        output: [
          { type: "reasoning", id: "rs_unfinished", status: "incomplete" },
          ...plainFixture().output,
        ],
      }),
    ).toMatchObject({ state: "partial", truncation: { provider: true } });
  });

  it("does not infer money from arbitrary native monetary fields", () => {
    expect(
      normalize({
        ...plainFixture(),
        cost: "0.01",
        usage: { ...plainFixture().usage, total_cost: "0.01" },
      }),
    ).toMatchObject({
      usage: { completeness: "complete" },
      providerCost: { certainty: "unknown", amount: null, basis: "unknown" },
    });
  });

  it.each([undefined, null, { input_tokens: 7 }])(
    "roundtrips nullable and partial usage independently of money: %j",
    (usage) => {
      const result = normalize({ ...plainFixture(), usage });
      expect(result.providerCost).toMatchObject({ amount: null, certainty: "unknown" });
      expect(result.usage.completeness).toBe(
        usage === null || usage === undefined ? "unknown" : "partial",
      );
    },
  );

  it("maps content filtering and model refusal safely", () => {
    expect(
      normalize({
        ...plainFixture(),
        status: "incomplete",
        incomplete_details: { reason: "content_filter" },
      }),
    ).toMatchObject({ state: "failed", failure: "refused" });
    expect(
      normalize({
        ...plainFixture(),
        status: "failed",
        error: { code: "model_not_found", message: "arbitrary echo" },
        output: [],
      }),
    ).toMatchObject({ state: "failed", failure: "unsupported_model", answer: null });
  });

  it.each(["queued", "in_progress", "cancelled"])(
    "leaves nonterminal/unconfirmed %s unknown",
    (status) => {
      expect(normalize({ ...plainFixture(), status })).toMatchObject({
        state: "unknown",
        failure: "accounting_unknown",
      });
    },
  );

  it.each([
    { output: [] },
    { error: { code: "echo" } },
    { status: "future-status" },
    { output: [{ type: "function_call", id: "fc_synthetic", name: "shell" }] },
    { output: [message([text("\ud800")])] },
    { output: [message([text("one")]), message([text("two")])] },
  ])("rejects invalid response structure: %j", (changes) => {
    expect(() => normalize({ ...plainFixture(), ...changes })).toThrow();
  });

  it("rejects unexpected or excess tool output without executing it", () => {
    expect(() => normalize(searchFixture(), "gpt-5", 0)).toThrow();
    const raw = searchFixture();
    const call = raw.output.find((item) => item.type === "web_search_call");
    raw.output.push({ ...call, id: "ws_second" } as (typeof raw.output)[number]);
    expect(() => normalize(raw, "gpt-5", 1)).toThrow();
  });
});
