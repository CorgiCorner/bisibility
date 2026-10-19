import { describe, expect, it } from "vitest";
import type { Json, SdkDocument } from "./openapi-sdk-lint-schema.test-support";
import { extensionValueProblems } from "./openapi-sdk-lint-values.test-support";
import { sdkName, shorthandUnion, usdNumber } from "./openapi-sdk-schema";

const object = { type: "object", properties: { keyword: { type: "string" } } };
const canonical = { ...object, ...sdkName("CanonicalKeyword") };
const union = {
  oneOf: [{ type: "string" }, canonical],
  ...sdkName("KeywordInput"),
  ...shorthandUnion("CanonicalKeyword"),
};

function document(
  schema: Json,
  location = "body",
  schemas: Record<string, Json> = {},
): SdkDocument {
  const content = { "application/json": { schema } };
  return {
    components: { schemas },
    paths: {
      "/keywords": {
        post: {
          operationId: "createKeyword",
          ...(location === "body"
            ? { requestBody: { content } }
            : location === "response"
              ? { responses: { "200": { content } } }
              : { parameters: [{ name: "keyword", in: location, schema }] }),
        },
      },
    },
  };
}

describe("Phase 3 SDK vocabulary", () => {
  it("accepts named inline and referenced object and object-array canonical branches", () => {
    expect(extensionValueProblems(document(union))).toEqual([]);
    expect(
      extensionValueProblems(
        document(
          {
            anyOf: [{ type: "string" }, { $ref: "#/components/schemas/KeywordsAlias" }],
            ...sdkName("KeywordsInput"),
            ...shorthandUnion("Keywords"),
          },
          "body",
          {
            KeywordsAlias: { $ref: "#/components/schemas/Keywords" },
            Keywords: { type: "array", items: { $ref: "#/components/schemas/KeywordAlias" } },
            KeywordAlias: { $ref: "#/components/schemas/Keyword" },
            Keyword: object,
          },
        ),
      ),
    ).toEqual([]);
  });

  it.each(["response", "query", "path", "header", "cookie"])(
    "rejects shorthand in %s",
    (location) => {
      expect(extensionValueProblems(document(union, location))).toEqual([
        expect.stringContaining("shorthand-outside-request-body"),
      ]);
    },
  );

  it("rejects shorthand through a response component also used in a request body", () => {
    const { "x-bisibility-name": _name, ...componentUnion } = union;
    const doc = document({ $ref: "#/components/schemas/Input" }, "body", { Input: componentUnion });
    doc.paths["/keywords"].post = {
      ...(doc.paths["/keywords"].post as Json),
      responses: {
        "422": {
          content: {
            "application/problem+json": { schema: { $ref: "#/components/schemas/Input" } },
          },
        },
      },
    };
    expect(extensionValueProblems(doc)).toContainEqual(
      expect.stringContaining("shorthand-outside-request-body"),
    );
  });

  it("rejects shorthand in referenced component parameters and path-level parameters", () => {
    const doc = document({ type: "string" });
    doc.components.parameters = { Keyword: { in: "query", name: "keyword", schema: union } };
    doc.paths["/keywords"].parameters = [{ $ref: "#/components/parameters/Keyword" }];
    expect(extensionValueProblems(doc)).toContainEqual(
      expect.stringContaining("shorthand-outside-request-body"),
    );
    delete doc.paths["/keywords"].parameters;
    expect(extensionValueProblems(doc)).toEqual([
      expect.stringContaining("shorthand-outside-request-body /components/parameters"),
    ]);
  });

  it.each([
    { ...union, ...shorthandUnion("Missing") },
    { ...union, oneOf: [canonical, canonical] },
    { ...union, oneOf: [{ type: "string", ...sdkName("CanonicalKeyword") }] },
    {
      ...union,
      oneOf: [{ type: "array", items: { type: "string" }, ...sdkName("CanonicalKeyword") }],
    },
    { ...union, oneOf: undefined },
    {
      ...union,
      "x-bisibility-union": { style: "shorthand", canonical: "CanonicalKeyword", cases: [] },
    },
  ])("rejects malformed or non-object canonical branches %#", (schema) => {
    expect(extensionValueProblems(document(schema))).toContainEqual(
      expect.stringContaining("invalid x-bisibility-union"),
    );
  });

  it.each(["number", ["number", "null"]])("accepts usd_number on %j", (type) => {
    expect(extensionValueProblems(document({ type, ...usdNumber }))).toEqual([]);
  });

  it.each([
    "integer",
    "string",
    "boolean",
    "object",
    "array",
    "null",
    ["number", "string"],
    undefined,
  ])("rejects usd_number on %j", (type) => {
    expect(extensionValueProblems(document({ type, ...usdNumber }))).toEqual([
      expect.stringContaining("invalid x-bisibility-money"),
    ]);
  });
});
