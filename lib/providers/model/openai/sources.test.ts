import {
  assertNoUnexpectedFetch,
  interceptedFetch,
} from "@/lib/providers/model/transport.test-support";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { plainFixture, searchFixture } from "./adapter.test-support";
import { evidence, searchCall, source } from "./evidence.test-support";

beforeEach(() => {
  interceptedFetch();
});
afterEach(() => {
  assertNoUnexpectedFetch();
  vi.unstubAllGlobals();
});

describe("consulted source evidence", () => {
  it("retains consulted-only URLs separately from repeated citations", () => {
    const result = evidence({ ...searchFixture(), model: plainFixture().model });
    expect(result.consultedSources).toEqual({
      sources: [
        { sourceId: result.citations[0].sourceId, url: "https://example.org/source", title: null },
        { sourceId: expect.any(String), url: "https://example.org/consulted-only", title: null },
      ],
      total: 2,
      omitted: 0,
      truncated: false,
    });
    expect(result.citations).toHaveLength(2);
    expect(result.citations.every((item) => item.url === "https://example.org/source")).toBe(true);
    expect(result.citationTotals).toEqual({ total: 2, omitted: 0 });
  });

  it("deduplicates canonical URLs across complete search lists in first-seen order", () => {
    const result = evidence(
      {
        ...plainFixture(),
        output: [
          ...plainFixture().output,
          searchCall([source("https://EXAMPLE.org:443/source"), source()]),
          searchCall([source(), source("https://example.org/second")], "ws_second"),
        ],
      },
      2,
    );
    expect(result.consultedSources).toMatchObject({ total: 2, omitted: 0, truncated: false });
    expect(result.consultedSources?.sources.map((item) => item.url)).toEqual([
      "https://example.org/source",
      "https://example.org/second",
    ]);
  });

  it.each([100, 101, 120])("bounds %i unique sources with truthful counters", (count) => {
    const sources = Array.from({ length: count }, (_, i) => source(`https://example.org/${i}`));
    const result = evidence({
      ...plainFixture(),
      output: [...plainFixture().output, searchCall([...sources, sources[0]])],
    });
    expect(result.consultedSources).toMatchObject({
      total: count,
      omitted: Math.max(0, count - 100),
      truncated: count > 100,
    });
    expect(result.consultedSources?.sources).toHaveLength(Math.min(count, 100));
    expect(result.state).toBe("completed");
    expect(result.truncation).toEqual({ provider: false, application: false, citations: false });
  });

  it("distinguishes an explicit empty complete list from missing evidence", () => {
    const result = evidence({
      ...plainFixture(),
      output: [...plainFixture().output, searchCall([])],
    });
    expect(result.consultedSources).toEqual({
      sources: [],
      total: 0,
      omitted: 0,
      truncated: false,
    });
  });

  it.each([
    "missing-list",
    "missing-action",
    "open-page",
    "unfinished",
    "incomplete",
    "failed",
    "queued",
  ])("keeps totals unknown for %s without dropping known URLs", (kind) => {
    const other =
      kind === "missing-action"
        ? { type: "web_search_call", id: "ws_second", status: "completed" }
        : kind === "open-page"
          ? {
              type: "web_search_call",
              id: "ws_second",
              status: "completed",
              action: { type: "open_page", url: "https://example.org/other" },
            }
          : searchCall(
              kind === "missing-list" ? undefined : [source()],
              "ws_second",
              kind === "unfinished" ? "in_progress" : "completed",
            );
    const result = evidence(
      {
        ...plainFixture(),
        ...(["incomplete", "failed", "queued"].includes(kind) ? { status: kind } : {}),
        output: [...plainFixture().output, searchCall([source()]), other],
      },
      2,
    );
    expect(result.consultedSources).toMatchObject({ total: null, omitted: null, truncated: false });
    expect(result.consultedSources?.sources.map((item) => item.url)).toEqual([
      "https://example.org/source",
    ]);
  });

  it("flags dropped URLs but keeps total omissions unknown when another list is missing", () => {
    const result = evidence(
      {
        ...plainFixture(),
        output: [
          ...plainFixture().output,
          searchCall(Array.from({ length: 103 }, (_, i) => source(`https://example.org/${i}`))),
          searchCall(undefined, "ws_second"),
        ],
      },
      2,
    );
    expect(result.consultedSources).toMatchObject({ total: null, omitted: null, truncated: true });
    expect(result.consultedSources?.sources).toHaveLength(100);
  });

  it("does not derive a consulted total from citations or billable calls", () => {
    const raw = searchFixture();
    const result = evidence({
      ...raw,
      model: plainFixture().model,
      output: raw.output.filter((item) => item.type !== "web_search_call"),
    });
    expect(result.consultedSources).toEqual({
      sources: [],
      total: null,
      omitted: null,
      truncated: false,
    });
    expect(result.citationTotals).toEqual({ total: 2, omitted: 0 });
    expect(result.usage.searchCalls).toBe(1);
  });

  it.each([
    source("https://user:pass@example.com"),
    source("javascript:alert(1)"),
    source("https://example.org/ bad"),
    source(`https://example.org/${"a".repeat(2048)}`),
    source(`https://example.org/${"é".repeat(400)}`),
    { type: "feed", url: "https://example.org/feed" },
    { type: "feed" },
    { type: "url", url: 42 },
    null,
  ])("drops a rejected supplementary entry without losing the answer: %j", (entry) => {
    const raw = { ...searchFixture(), model: plainFixture().model };
    const expected = evidence(raw);
    const result = evidence({
      ...raw,
      output: [
        ...raw.output.filter((item) => item.type !== "web_search_call"),
        searchCall([source(), entry, source("https://example.org/after")]),
      ],
    });
    expect(result.consultedSources).toEqual({
      sources: [
        {
          sourceId: expected.citations[0].sourceId,
          url: "https://example.org/source",
          title: null,
        },
        { sourceId: expect.any(String), url: "https://example.org/after", title: null },
      ],
      total: null,
      omitted: null,
      truncated: true,
    });
    expect(result.answer).toBe(expected.answer);
    expect(result.citations).toEqual(expected.citations);
    expect(result.citationTotals).toEqual(expected.citationTotals);
    expect(result.usage).toEqual(expected.usage);
    expect(result.state).toBe(expected.state);
    expect(result.failure).toBe(expected.failure);
    expect(result.truncation).toEqual(expected.truncation);
  });

  it("keeps totals unknown for a completed response with zero calls when search was requested", () => {
    const result = evidence({
      ...plainFixture(),
      tool_usage: { web_search: { num_requests: 0 } },
    });
    expect(result.state).toBe("completed");
    expect(result.column.settings.search.mode).toBe("openai_web_search");
    expect(result.usage.searchCalls).toBe(0);
    expect(result.consultedSources).toEqual({
      sources: [],
      total: null,
      omitted: null,
      truncated: false,
    });
  });

  it("keeps citation totals unknown when the provider truncated the answer", () => {
    const result = evidence({
      ...searchFixture(),
      model: plainFixture().model,
      status: "incomplete",
      incomplete_details: { reason: "max_output_tokens" },
    });
    expect(result.citations).toHaveLength(2);
    expect(result.citationTotals).toEqual({ total: null, omitted: null });
    expect(result).toMatchObject({ state: "partial", truncation: { provider: true } });
  });

  it("counts all citation occurrences, including those omitted by the bound", () => {
    const raw = searchFixture();
    const message = raw.output.find((item) => item.type === "message");
    if (!message?.content) throw new Error("Fixture message missing");
    const annotation = message.content[0].annotations[0];
    message.content[0].annotations = Array.from({ length: 103 }, () => ({ ...annotation }));
    const result = evidence({ ...raw, model: plainFixture().model });
    expect(result.citations).toHaveLength(100);
    expect(result.citationTotals).toEqual({ total: 103, omitted: 3 });
    expect(result.truncation.citations).toBe(true);
  });

  it("counts citations dropped beyond the retained answer", () => {
    const raw = searchFixture();
    const message = raw.output.find((item) => item.type === "message");
    if (!message?.content) throw new Error("Fixture message missing");
    const annotation = message.content[0].annotations[0];
    message.content.unshift({ type: "output_text", text: "a".repeat(24576), annotations: [] });
    message.content[1].annotations = [annotation];
    const result = evidence({ ...raw, model: plainFixture().model });
    expect(result.citations).toEqual([]);
    expect(result.citationTotals).toEqual({ total: 1, omitted: 1 });
  });

  it.each(["\ud800", "\udfff", "valid\ud800tail", "bad\0title"])(
    "nulls unsafe citation title %j without losing usage",
    (title) => {
      const raw = searchFixture();
      const message = raw.output.find((item) => item.type === "message");
      if (!message?.content) throw new Error("Fixture message missing");
      message.content[0].annotations[0].title = title;
      const result = evidence({ ...raw, model: plainFixture().model });
      expect(result.citations[0].title).toBeNull();
      expect(result.usage.inputTokens).toBe(100);
      expect(result.citationTotals).toEqual({ total: 2, omitted: 0 });
      expect(result.truncation.citations).toBe(true);
    },
  );

  it.each(["\ud800", "\udfff", "valid\ud800tail"])(
    "ignores undocumented unsafe consulted title %j",
    (title) => {
      const result = evidence({
        ...plainFixture(),
        output: [...plainFixture().output, searchCall([{ ...source(), title }])],
      });
      expect(result.consultedSources?.sources[0].title).toBeNull();
      expect(result.consultedSources?.total).toBe(1);
      expect(JSON.stringify(result)).not.toContain("\\ud800");
      expect(JSON.stringify(result)).not.toContain("\\udfff");
    },
  );
});
