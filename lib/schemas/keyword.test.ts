import { keywordCreateItemSchema } from "@/lib/api/schemas";
import { describe, expect, it } from "vitest";
import {
  addKeywordSchema,
  addKeywordsSchema,
  bulkKeywordTargetSchema,
  canonicalKeySchema,
  intentSchema,
  JITTER_MINUTES_RANGE_MESSAGE,
  keywordScheduleBaseSchema,
  keywordScheduleUpdateSchema,
  locationSelectionSchema,
  topicSchema,
  updateKeywordSchema,
} from "./keyword";
import { projectDefaultsSchema } from "./project";
import { serpDepthDecreaseWarning } from "./serp-depth";

describe("SERP keyword schemas", () => {
  it("accepts the bounded jitter range and preserves its default", () => {
    const schedule = { cronExpression: null, frequency: "daily", timezone: "UTC" } as const;

    expect(keywordScheduleBaseSchema.parse({ ...schedule, jitterMinutes: 0 }).jitterMinutes).toBe(
      0,
    );
    expect(keywordScheduleBaseSchema.parse({ ...schedule, jitterMinutes: 120 }).jitterMinutes).toBe(
      120,
    );
    expect(keywordScheduleBaseSchema.parse(schedule).jitterMinutes).toBe(60);
    expect(() => keywordScheduleBaseSchema.parse({ ...schedule, jitterMinutes: 121 })).toThrow(
      JITTER_MINUTES_RANGE_MESSAGE,
    );
    expect(
      projectDefaultsSchema.parse({
        ...schedule,
        country: "US",
        jitterMinutes: 120,
        projectId: "prj_1",
      }).jitterMinutes,
    ).toBe(120);
    expect(() =>
      projectDefaultsSchema.parse({
        ...schedule,
        country: "US",
        jitterMinutes: 121,
        projectId: "prj_1",
      }),
    ).toThrow(JITTER_MINUTES_RANGE_MESSAGE);
  });

  it("accepts IANA schedule time zones and rejects free-form values", () => {
    const schedule = {
      cronExpression: null,
      frequency: "manual",
      jitterMinutes: 0,
      keywordId: "kw_1",
    };

    expect(
      keywordScheduleUpdateSchema.parse({ ...schedule, timezone: "Europe/Warsaw" }).timezone,
    ).toBe("Europe/Warsaw");
    expect(() => keywordScheduleUpdateSchema.parse({ ...schedule, timezone: "warsaw" })).toThrow(
      "Select a valid time zone.",
    );
  });

  it("normalizes supported country aliases to canonical market names", () => {
    expect(
      addKeywordSchema.parse({ keyword: "rank tracker", location: "US", projectId: "prj_1" })
        .location,
    ).toBe("United States");
    expect(keywordCreateItemSchema.parse({ country: "PL", keyword: "rank tracker" }).country).toBe(
      "Poland",
    );
    expect(
      projectDefaultsSchema.parse({
        country: "DE",
        cronExpression: null,
        frequency: "manual",
        projectId: "prj_1",
      }).country,
    ).toBe("Germany");
  });

  it("rejects unsupported global/free-form markets before provider execution", () => {
    expect(() =>
      addKeywordSchema.parse({ keyword: "rank tracker", location: "Global", projectId: "prj_1" }),
    ).toThrow();
    expect(() =>
      keywordCreateItemSchema.parse({ country: "Mars", keyword: "rank tracker" }),
    ).toThrow();
    expect(serpDepthDecreaseWarning(20)).toBe(
      "keywords ranking below 20 will be reported as not found; alerts deeper than 20 will not fire",
    );
  });

  it("normalizes and validates structured keyword batch rows", () => {
    expect(
      addKeywordsSchema.parse({
        projectId: "prj_1",
        rows: [{ device: "MOBILE", keyword: "rank tracker", location: "GB" }],
      }).rows?.[0],
    ).toMatchObject({ device: "mobile", location: "United Kingdom" });
    expect(() =>
      addKeywordsSchema.parse({
        projectId: "prj_1",
        rows: [{ device: "tablet", keyword: "rank tracker", location: "GB" }],
      }),
    ).toThrow();
    expect(() =>
      addKeywordsSchema.parse({
        projectId: "prj_1",
        rows: [{ device: "desktop", keyword: "rank tracker", location: "ZZ" }],
      }),
    ).toThrow();
  });

  it("validates canonical location keys and selection inputs", () => {
    expect(canonicalKeySchema.parse("US")).toBe("US");
    expect(canonicalKeySchema.parse("US/Texas/Austin")).toBe("US/Texas/Austin");
    expect(canonicalKeySchema.parse("US/US-TX/Austin")).toBe("US/US-TX/Austin");
    expect(locationSelectionSchema.parse({ country: "US" })).toEqual({
      country: "United States",
    });
    expect(locationSelectionSchema.parse({ locationKey: "US/Texas/Austin" })).toEqual({
      locationKey: "US/Texas/Austin",
    });
    expect(() => canonicalKeySchema.parse("us/texas/austin")).toThrow();
    expect(() => locationSelectionSchema.parse({ locationKey: "US/Texas/Austin/Extra" })).toThrow();
  });

  it("accepts canonical location keys on keyword add and update inputs", () => {
    expect(
      addKeywordSchema.parse({
        keyword: "rank tracker",
        locationKey: "US/Texas/Austin",
        projectId: "prj_1",
      }).locationKey,
    ).toBe("US/Texas/Austin");
    expect(
      updateKeywordSchema.parse({
        keywordId: "kw_1",
        locationKey: "US/Texas/Austin",
      }).locationKey,
    ).toBe("US/Texas/Austin");
  });

  it("normalizes optional keyword topic and intent metadata", () => {
    expect(topicSchema.parse("")).toBeNull();
    expect(intentSchema.parse("")).toBeNull();
    expect(topicSchema.parse("  Product  ")).toBe("Product");
    expect(intentSchema.parse("commercial")).toBe("commercial");
    expect(() => topicSchema.parse("x".repeat(81))).toThrow();
    expect(() => intentSchema.parse("x".repeat(81))).toThrow();
    expect(
      addKeywordSchema.parse({
        intent: "",
        keyword: "rank tracker",
        location: "US",
        projectId: "prj_1",
        topic: "Product",
      }),
    ).toMatchObject({ intent: null, topic: "Product" });
    expect(updateKeywordSchema.parse({ keywordId: "kw_1", topic: "" }).topic).toBeNull();
  });

  it("requires an explicit non-empty URL for bulk target updates", () => {
    const base = { keywordIds: ["kw_1"], projectId: "prj_1" };
    expect(
      bulkKeywordTargetSchema.parse({ ...base, targetUrl: "/features/rank-tracking" }),
    ).toMatchObject({ targetUrl: "/features/rank-tracking" });
    expect(() => bulkKeywordTargetSchema.parse({ ...base, targetUrl: "" })).toThrow(
      "Enter a target URL.",
    );
    expect(updateKeywordSchema.parse({ keywordId: "kw_1", targetUrl: "" }).targetUrl).toBeNull();
  });

  it("accepts only supported SERP depths for project defaults and keyword overrides", () => {
    for (const serpDepth of [10, 20, 50, 100]) {
      expect(
        projectDefaultsSchema.parse({
          country: "US",
          cronExpression: null,
          frequency: "daily",
          projectId: "prj_1",
          serpDepth,
        }).serpDepth,
      ).toBe(serpDepth);
      expect(
        keywordScheduleUpdateSchema.parse({
          cronExpression: null,
          frequency: "daily",
          keywordId: "kw_1",
          serpDepth,
        }).serpDepth,
      ).toBe(serpDepth);
    }

    expect(
      projectDefaultsSchema.parse({
        country: "US",
        cronExpression: null,
        frequency: "daily",
        projectId: "prj_1",
      }).serpDepth,
    ).toBe(100);
    expect(() =>
      projectDefaultsSchema.parse({
        country: "US",
        cronExpression: null,
        frequency: "daily",
        projectId: "prj_1",
        serpDepth: 15,
      }),
    ).toThrow();
    expect(() =>
      keywordScheduleUpdateSchema.parse({
        cronExpression: null,
        frequency: "daily",
        keywordId: "kw_1",
        serpDepth: 15,
      }),
    ).toThrow();
  });
});
