import { describe, expect, it } from "vitest";
import { keywordCreateBodySchema, parseKeywordCreateBody } from "./keyword-create-input";
import { scheduleFromCreate } from "./keyword-utils";
import { keywordCreateItemSchema } from "./schemas";

const item = { keyword: " keyword " };
const parsed = { keyword: "keyword", tags: [] };

describe("keyword create wire input", () => {
  it.each([{}, [], { keywords: [] }, { keywords: [""] }, ["keyword"]])(
    "preserves legacy validation details for %#",
    (body) => {
      const normalized = Array.isArray(body)
        ? body
        : "keywords" in body && Array.isArray(body.keywords)
          ? body.keywords.map((item) => (typeof item === "string" ? { keyword: item } : item))
          : [body];
      const old = keywordCreateItemSchema.array().min(1).max(500).safeParse(normalized);
      if (old.success) throw new Error("Expected an invalid legacy body");
      try {
        parseKeywordCreateBody(body);
        throw new Error("Expected validation failure");
      } catch (error) {
        expect(error).toHaveProperty("issues", old.error.issues);
      }
    },
  );
  it("keeps single objects, object arrays, and wrapped object/string shorthand", () => {
    expect(keywordCreateBodySchema.parse(item)).toEqual(parsed);
    expect(keywordCreateBodySchema.parse([item])).toEqual([parsed]);
    expect(keywordCreateBodySchema.parse({ keywords: [item, "keyword"] })).toEqual({
      keywords: [parsed, parsed],
    });
  });

  it("preserves wrapper precedence and strips extra fields", () => {
    expect(keywordCreateBodySchema.parse({ ...item, keywords: ["wrapped"] })).toEqual({
      keywords: [{ keyword: "wrapped", tags: [] }],
    });
    expect(keywordCreateBodySchema.parse({ ...item, keywords: "ignored", other: true })).toEqual(
      parsed,
    );
    expect(keywordCreateBodySchema.safeParse({ ...item, keywords: [] }).success).toBe(false);
    expect(keywordCreateBodySchema.safeParse({ ...item, keywords: [null] }).success).toBe(false);
  });

  it.each([
    [],
    { keywords: [] },
    ["keyword"],
    "keyword",
    { keywords: [""] },
    { keywords: Array(501).fill("keyword") },
  ])("rejects invalid input %#", (value) => {
    expect(keywordCreateBodySchema.safeParse(value).success).toBe(false);
  });
});

it("refuses an incomplete explicit custom cadence before persistence", () => {
  expect(() =>
    scheduleFromCreate(
      keywordCreateItemSchema.parse({ keyword: "cron", frequency: "custom_cron" }),
    ),
  ).toThrow("Custom cron schedules require a cron expression.");
});
