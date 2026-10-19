import { describe, expect, it } from "vitest";
import { ZodError } from "zod";
import { ApiInputError } from "./errors";
import { parseKeywordListQuery } from "./keyword-list-query";

const parse = (query: string) =>
  parseKeywordListQuery(new URL(`https://example.com/api/v1/projects/p/keywords?${query}`));

function inputError(query: string) {
  try {
    parse(query);
  } catch (error) {
    return error;
  }
  throw new Error(`Expected ${query} to be rejected.`);
}

describe("listKeywords query", () => {
  it("prefers a filter[...] alias over its plain name and search over q", () => {
    expect(parse("tag=plain&filter[tag]=alias&q=short&search=long")).toMatchObject({
      search: "long",
      tag: "alias",
    });
    expect(parse("q=short")).toMatchObject({ search: "short" });
    expect(parse("filter[tag]=&tag=plain")).toMatchObject({ tag: "plain" });
  });

  it("coerces numeric filters and treats empty values as absent", () => {
    expect(parse("filter[position_gt]=3&position_lt=10&device=&limit=")).toEqual({
      position_gt: 3,
      position_lt: 10,
    });
  });

  it("keeps the established messages for invalid filters", () => {
    const cases = [
      ["device=tablet", "device must be desktop or mobile."],
      ["topic=%20%20", "topic must be a non-empty string up to 80 characters."],
      [
        `filter[intent]=${"x".repeat(81)}`,
        "intent must be a non-empty string up to 80 characters.",
      ],
      ["position_gt=high", "filter[position_gt] must be a number."],
    ] as const;
    for (const [query, message] of cases) {
      const error = inputError(query);
      expect(error).toBeInstanceOf(ApiInputError);
      expect((error as ApiInputError).message).toBe(message);
    }
  });

  it("rejects a sort or limit outside the documented values", () => {
    expect(inputError("sort=popularity")).toBeInstanceOf(ZodError);
    expect(inputError("limit=500&device=tablet")).toBeInstanceOf(ZodError);
  });
});
