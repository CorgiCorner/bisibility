import { describe, expect, it } from "vitest";
import { aiVisibilitySourcesInsightHref, overviewFilterHref } from "./overview-href";
import {
  citationHost,
  hostOnSite,
  marketFromParameters,
  marketKey,
  overviewFiltersFromQuery,
  overviewPeriodStart,
  overviewSearchParams,
  parseMarketKey,
  parseUsdMicros,
} from "./overview-model";

describe("overview filters", () => {
  it("defaults to the last 30 days and omits that default from the URL", () => {
    const now = new Date("2026-11-10T12:00:00.000Z");
    const filters = overviewFiltersFromQuery({});
    expect(filters.period).toBe("30d");
    expect(overviewPeriodStart(filters.period, now)?.toISOString()).toBe(
      "2026-10-11T12:00:00.000Z",
    );
    expect(overviewPeriodStart("all", now)).toBeNull();
    expect(overviewSearchParams(filters).toString()).toBe("tab=overview");
  });

  it("keeps a valid engine, topic, market and branded split", () => {
    const filters = overviewFiltersFromQuery({
      engine: "chat_gpt",
      market: marketKey({ kind: "name", language: "en", location: "United States" }),
      prompts: "unbranded",
      range: "7d",
      topic: "ait_abcdefghijklmnopqrstuvwx",
    });
    expect(filters).toMatchObject({
      engine: "chat_gpt",
      period: "7d",
      promptKind: "unbranded",
      topic: "ait_abcdefghijklmnopqrstuvwx",
    });
    expect(filters.market).toEqual({ kind: "name", language: "en", location: "United States" });
    expect(overviewSearchParams(filters).get("prompts")).toBe("unbranded");
  });

  it("ignores an unknown engine, topic and market", () => {
    const filters = overviewFiltersFromQuery({
      engine: "bing",
      market: "not-a-market",
      topic: "topic_1",
    });
    expect(filters.engine).toBeNull();
    expect(filters.market).toBeNull();
    expect(filters.topic).toBeNull();
    expect(parseMarketKey("c:2840:en")).toEqual({ code: 2840, kind: "code", language: "en" });
  });
});

describe("overview measurements", () => {
  it("parses dollar strings to micros and matches a site with or without www", () => {
    expect(parseUsdMicros("0.0012")).toBe(1200);
    expect(parseUsdMicros("1")).toBe(1_000_000);
    expect(parseUsdMicros("nope")).toBeNull();
    expect(citationHost("https://www.acme.example.com/pricing")).toBe("acme.example.com");
    expect(hostOnSite("acme.example.com", "www.acme.example.com")).toBe(true);
    expect(hostOnSite("blog.acme.example.com", "acme.example.com")).toBe(false);
    expect(
      marketFromParameters({ language_code: "en", location_name: "United States" }, (code) =>
        code === "en" ? "English" : code,
      ),
    ).toEqual({
      key: marketKey({ kind: "name", language: "en", location: "United States" }),
      label: "United States · English",
    });
    expect(marketFromParameters({ max_output_tokens: 1024 }, (code) => code)).toBeNull();
  });

  it("keeps unrelated parameters when overview filters change", () => {
    const href = overviewFilterHref(
      "/app/prj_1/ai-visibility",
      new URLSearchParams("foo=1&range=7d"),
      overviewFiltersFromQuery({}),
    );
    expect(href).toBe("/app/prj_1/ai-visibility?foo=1&tab=overview");
  });

  it("opens sources on the same filters with the unbranded split", () => {
    const href = aiVisibilitySourcesInsightHref(
      "/app/prj_1/ai-visibility",
      new URLSearchParams("foo=1&range=7d&engine=chat_gpt"),
      overviewFiltersFromQuery({ engine: "chat_gpt", range: "7d" }),
    );
    expect(href).toBe(
      "/app/prj_1/ai-visibility?foo=1&tab=sources&range=7d&engine=chat_gpt&prompts=unbranded",
    );
  });
});
