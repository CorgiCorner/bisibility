import { MODEL_PLAYGROUND_LIMITS } from "@/lib/model-playground/schema";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { canary, normalized, prompt, searchFixture, textFixture } from "./fixtures.test-support";

const unexpectedNetwork = vi.fn(() => {
  throw new Error("Unexpected network");
});
beforeEach(() => {
  unexpectedNetwork.mockClear();
  vi.stubGlobal("fetch", unexpectedNetwork);
});
afterEach(() => {
  expect(unexpectedNetwork).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
});

it("retains every text block in order with native identity and no guessed money", () => {
  const result = normalized();
  expect(result).toMatchObject({
    state: "completed",
    failure: null,
    actualProviderId: null,
    actualModelId: "claude-opus-5-5",
    answer: "First 😀. Second block.",
    providerCost: { amount: null, certainty: "unknown", basis: "unknown" },
  });
});
it.each([[], null, undefined])(
  "accepts an ungrounded text block with empty citations %j",
  (citations) => {
    expect(
      normalized({ ...textFixture(), content: [{ type: "text", text: "Answer", citations }] }),
    ).toMatchObject({ state: "completed", answer: "Answer" });
  },
);

it("keeps consulted search results separate from repeated citations with unknown answer offsets", () => {
  const result = normalized(searchFixture(), true);
  expect(result.state).toBe("completed");
  expect(result.answer).toBe("Searching 😀. The answer.");
  expect(result.citations).toHaveLength(2);
  expect(new Set(result.citations.map((item) => item.sourceId)).size).toBe(1);
  expect(new Set(result.citations.map((item) => item.occurrenceId)).size).toBe(2);
  expect(result.citations.map((item) => [item.start, item.end])).toEqual([
    [null, null],
    [null, null],
  ]);
  expect(JSON.stringify(result)).not.toContain("synthetic-index");
  expect(JSON.stringify(result)).not.toContain("synthetic-not-encrypted");
});

it.each(["max_tokens", "model_context_window_exceeded", "pause_turn", "tool_use"])(
  "marks %s incomplete without inventing completion",
  (stop_reason) => {
    const result = normalized({ ...textFixture(), stop_reason });
    expect(result).toMatchObject({ state: "partial", truncation: { provider: true } });
    expect(result.answer).toBe("First 😀. Second block.");
  },
);
it("preserves terminal stop_sequence and native refusal", () => {
  expect(normalized({ ...textFixture(), stop_reason: "stop_sequence" }).state).toBe("completed");
  for (const fields of [
    { stop_reason: "refusal" },
    { stop_details: { type: "refusal", explanation: `${prompt} ${canary}` } },
  ]) {
    const result = normalized({ ...textFixture(), ...fields });
    expect(result).toMatchObject({
      state: "failed",
      failure: "refused",
      answer: "First 😀. Second block.",
    });
    expect(JSON.stringify(result)).not.toContain(canary);
  }
});
it.each([null, "unknown_new_reason"])("does not label unknown stop %s complete", (stop_reason) => {
  expect(normalized({ ...textFixture(), stop_reason })).toMatchObject({
    state: "partial",
    failure: "invalid_response",
    truncation: { provider: true },
  });
});

it("keeps a well-formed full answer prefix at the UTF-8 byte boundary", () => {
  const prefix = "a".repeat(MODEL_PLAYGROUND_LIMITS.answerBytes - 2);
  const result = normalized({
    ...textFixture(),
    content: [
      { type: "text", text: `${prefix}😀tail` },
      { type: "text", text: "z" },
    ],
  });
  expect(result.answer).toBe(prefix);
  expect(result).toMatchObject({ state: "partial", truncation: { application: true } });
  expect(Buffer.byteLength(result.answer ?? "")).toBe(MODEL_PLAYGROUND_LIMITS.answerBytes - 2);
});
it("retains an answer exactly at its bound without truncation", () => {
  const answer = "😀".repeat(MODEL_PLAYGROUND_LIMITS.answerBytes / 4);
  expect(normalized({ ...textFixture(), content: [{ type: "text", text: answer }] })).toMatchObject(
    { state: "completed", answer },
  );
});
it("bounds sources and titles while preserving source occurrences", () => {
  const source = {
    type: "web_search_result_location",
    url: "https://EXAMPLE.org/source",
    title: `${"a".repeat(511)}😀`,
  };
  const result = normalized(
    {
      ...textFixture(),
      content: [
        { type: "text", text: "😀x", citations: Array.from({ length: 101 }, () => source) },
      ],
    },
    true,
  );
  expect(result).toMatchObject({ state: "partial", truncation: { citations: true } });
  expect(result.citations).toHaveLength(100);
  expect(result.citations[0]).toMatchObject({
    url: "https://example.org/source",
    title: "a".repeat(511),
    start: null,
    end: null,
  });
});
it.each([
  "javascript:alert(1)",
  "https://user:pass@example.com/",
  "https://example.org/\n",
  `https://example.org/${"a".repeat(2050)}`,
  `https://example.org/${canary}`,
])("drops unsafe/unbounded source %s and marks citation truncation", (url) => {
  const result = normalized(
    {
      ...textFixture(),
      content: [
        {
          type: "text",
          text: "Answer",
          citations: [{ type: "web_search_result_location", url, title: "Source" }],
        },
      ],
    },
    true,
  );
  expect(result.citations).toEqual([]);
  expect(result.truncation.citations).toBe(true);
  expect(result.state).toBe("partial");
});
it("does not attach citations from a partially retained block", () => {
  const result = normalized(
    {
      ...textFixture(),
      content: [
        {
          type: "text",
          text: "a".repeat(25000),
          citations: [
            { type: "web_search_result_location", url: "https://example.org/", title: null },
          ],
        },
      ],
    },
    true,
  );
  expect(result.citations).toEqual([]);
  expect(result.truncation).toMatchObject({ application: true, citations: true });
});

it.each([
  null,
  {},
  [{ type: "text", text: 1 }],
  [{ type: "text", text: "bad\ud800" }],
  [{ type: "image" }],
  [{ type: "text", text: "Answer", citations: {} }],
])("rejects malformed content while retaining native measured usage: %j", (content) => {
  const result = normalized({ ...textFixture(), content });
  expect(result).toMatchObject({
    state: "failed",
    failure: "invalid_response",
    answer: null,
    usage: { inputTokens: 10, cacheWriteInputTokens: 30 },
  });
});
it("retains empty incomplete responses but rejects empty completed answers", () => {
  expect(normalized({ ...textFixture(), content: [], stop_reason: "max_tokens" })).toMatchObject({
    state: "partial",
    answer: "",
  });
  expect(normalized({ ...textFixture(), content: [] })).toMatchObject({
    state: "failed",
    failure: "invalid_response",
  });
});
it("preserves paid identity mismatch without returning a substituted answer", () => {
  expect(normalized({ ...textFixture(), model: "claude-different" })).toMatchObject({
    state: "failed",
    failure: "unsupported_model",
    actualModelId: "claude-different",
    answer: null,
    usage: { outputTokens: 15 },
  });
});
it.each([`${canary}`, "bad model", undefined])(
  "never adopts unsafe actual identity %s",
  (model) => {
    const result = normalized({ ...textFixture(), model });
    expect(result.actualModelId).toBeNull();
    expect(result.failure).toBe("invalid_response");
    expect(JSON.stringify(result)).not.toContain(canary);
  },
);
it("never returns arbitrary error echoes or a key in successful content", () => {
  for (const body of [
    { type: "error", error: { message: `${canary} ${prompt}` } },
    { ...textFixture(), content: [{ type: "text", text: `${canary} ${prompt}` }] },
  ]) {
    const result = normalized(body);
    expect(result).toMatchObject({ state: "failed", failure: "invalid_response", answer: null });
    expect(JSON.stringify(result)).not.toContain(canary);
    expect(JSON.stringify(result)).not.toContain(prompt);
  }
});
it("retains legitimate prompt echoes as answer text, with no prompt in diagnostics", () => {
  expect(normalized({ ...textFixture(), content: [{ type: "text", text: prompt }] })).toMatchObject(
    { answer: prompt, failure: null },
  );
});
it("keeps thinking out of answer text and counts its tokens as an output subset", () => {
  const result = normalized({
    ...textFixture(),
    content: [
      { type: "thinking", thinking: "Synthetic internal text" },
      { type: "redacted_thinking", data: "synthetic" },
      { type: "text", text: "Answer" },
    ],
  });
  expect(result).toMatchObject({
    answer: "Answer",
    usage: { outputTokens: 15, reasoningTokens: 3 },
  });
});
