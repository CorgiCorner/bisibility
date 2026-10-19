import { describe, expect, it } from "vitest";
import { evaluateResponseConformance } from "./openapi-response-conformance.test-support";
import {
  type ConformanceDocument,
  captureFindingsChecker,
  type ResponseCapture,
} from "./openapi-response-findings.test-support";
import { matchSpecOperation } from "./response-capture.test-support";
import { bodyShape, scrubBody, scrubString } from "./response-capture-normalize.test-support";

const json = (schema: object) => ({ content: { "application/json": { schema } } });
const document: ConformanceDocument = {
  components: {
    schemas: {
      Named: {
        properties: { id: { type: "string" }, name: { type: "string" } },
        required: ["id", "name"],
        type: "object",
      },
      Problem: {
        properties: { status: { type: "integer" }, title: { type: "string" } },
        type: "object",
      },
    },
  },
  paths: {
    "/items": {
      get: {
        operationId: "listItems",
        responses: {
          "200": json({
            properties: {
              data: {
                items: {
                  allOf: [
                    { $ref: "#/components/schemas/Named" },
                    { properties: { url: { format: "uri", type: "string" } }, type: "object" },
                  ],
                },
                type: "array",
              },
              owner: { anyOf: [{ $ref: "#/components/schemas/Named" }, { type: "null" }] },
            },
            type: "object",
          }),
          "400": json({ $ref: "#/components/schemas/Problem" }),
        },
      },
    },
    "/items/{id}": {
      get: {
        operationId: "getItem",
        responses: {
          "200": json({
            properties: {
              count: { exclusiveMinimum: true, minimum: 0, type: "integer" },
              label: { nullable: true, type: "string" },
              meta: { additionalProperties: true, type: "object" },
            },
            type: "object",
          }),
        },
      },
    },
  },
};

function capture(operationId: string, body: unknown, overrides: Partial<ResponseCapture> = {}) {
  return {
    body,
    contentType: "application/json",
    method: "GET",
    operationId,
    path: operationId === "listItems" ? "/items" : "/items/{id}",
    status: 200,
    ...overrides,
  };
}

const findingsOf = captureFindingsChecker(document);
const details = (value: ResponseCapture) =>
  findingsOf(value).map((finding) => `${finding.kind} ${finding.detail}`);

describe("response conformance findings", () => {
  it("accepts properties declared by any allOf member and the anyOf branch that matched", () => {
    const body = {
      data: [{ id: "a", name: "A", url: "https://example.com/a" }],
      owner: { id: "o", name: "Owner" },
    };

    expect(details(capture("listItems", body))).toEqual([]);
    expect(details(capture("listItems", { data: [], owner: null }))).toEqual([]);
  });

  it("reports undeclared properties through allOf, anyOf and array positions", () => {
    const body = {
      data: [{ extra: true, id: "a", name: "A" }],
      owner: { id: "o", name: "Owner", secret: 1 },
      unknown: 1,
    };

    expect(details(capture("listItems", body)).sort()).toEqual([
      "undeclared-property /data/*/extra",
      "undeclared-property /owner/secret",
      "undeclared-property /unknown",
    ]);
  });

  it("reports a missing field without blaming the null branch or every sibling property", () => {
    expect(details(capture("listItems", { data: [], owner: { extra: 1, id: "o" } }))).toEqual([
      "missing-required /owner/name",
    ]);
    expect(details(capture("listItems", { data: [], owner: "o" }))).toEqual([
      "composition-mismatch /owner matches no anyOf member",
    ]);
  });

  it("reads the spec as OpenAPI 3.1: nullable is ignored and 3.0 bounds become exclusive", () => {
    expect(details(capture("getItem", { count: 1, label: null }))).toEqual([
      "type-mismatch /label must be string",
    ]);
    expect(details(capture("getItem", { count: 0, meta: { free: "form" } }))).toEqual([
      "value-mismatch /count exclusiveMinimum",
    ]);
    expect(
      details(capture("listItems", { data: [{ id: "a", name: "A", url: "not a uri" }] })),
    ).toEqual(["value-mismatch /data/*/url format"]);
  });

  it("reports undeclared statuses and media types but still checks the JSON body", () => {
    expect(details(capture("getItem", null, { status: 201 }))).toEqual([
      "undeclared-status status 201",
    ]);
    expect(
      details(
        capture(
          "listItems",
          { extra: 1, status: 400 },
          {
            contentType: "application/problem+json",
            status: 400,
          },
        ),
      ),
    ).toEqual(["content-type application/problem+json not declared", "undeclared-property /extra"]);
    expect(details(capture("getItem", null, { contentType: "text/csv" }))).toEqual([
      "content-type text/csv not declared",
    ]);
  });
});

describe("response conformance list", () => {
  it("groups failures by operation and status and lists operations without a success", () => {
    const entries = evaluateResponseConformance(document, [
      { capture: capture("listItems", { unknown: 1 }), source: "lib/api/a.test.ts" },
      { capture: capture("listItems", { other: 1 }), source: "lib/api/b.test.ts" },
      { capture: capture("listItems", { data: [] }), source: "lib/api/b.test.ts" },
    ]);

    expect(entries).toEqual([
      {
        kinds: ["no-capture"],
        operation: "getItem",
        status: "none",
      },
      {
        details: ["undeclared-property /other", "undeclared-property /unknown"],
        kinds: ["undeclared-property"],
        operation: "listItems",
        sources: ["lib/api/a.test.ts", "lib/api/b.test.ts"],
        status: "200",
      },
    ]);
    expect(
      evaluateResponseConformance(document, [
        { capture: capture("getItem", null, { status: 404 }), source: "lib/api/a.test.ts" },
      ]).filter((entry) => entry.operation === "getItem"),
    ).toEqual([
      { kinds: ["no-success-capture"], operation: "getItem", status: "2xx" },
      expect.objectContaining({ kinds: ["undeclared-status"], status: "404" }),
    ]);
  });
});

describe("response capture normalization", () => {
  it("zero-fills generated values while keeping public-ID and UUID patterns valid", () => {
    expect(scrubString("prj_k3x9m2p8q7r6s5t4u3v2w1y0")).toBe("prj_a00000000000000000000000");
    // An ID that breaks the pattern keeps breaking it.
    expect(scrubString("prj_0aaaaaaaaaaaaaaaaaaaaaaa")).toBe("prj_000000000000000000000000");
    expect(scrubString("6f1c2a9e-3b4d-4e5f-8a7b-1c2d3e4f5a6b")).toBe(
      "00000000-0000-4000-8000-000000000000",
    );
    expect(scrubString("bsb_key_live_H24uhRJI_x-YWY1sYqrY9IstnjjFRupQr9")).not.toMatch(/[1-9A-Z]/);
    expect(scrubString("bsb_key_live_H24uhRJI******p_r9")).toBe("000000000000000000000******0000");
    expect(scrubString("https://example.com/docs/api/errors#forbidden")).toBe(
      "https://example.com/docs/api/errors#forbidden",
    );
    expect(scrubBody({ list: [{ ref: "a1b2c3d4e5f6a7b8c9d0" }], ok: true })).toEqual({
      list: [{ ref: "00000000000000000000" }],
      ok: true,
    });
  });

  it("describes body structure independently of values and array order", () => {
    expect(bodyShape({ a: [1, "x", 2], b: null, c: 1.5 })).toEqual(
      bodyShape({ c: 2.5, b: null, a: ["y", 3] }),
    );
    expect(bodyShape({ a: [1] })).not.toEqual(bodyShape({ a: [1.5] }));
  });
});

describe("router operation attribution", () => {
  it("attributes a request by method and OpenAPI path template", () => {
    expect(
      matchSpecOperation("GET", ["projects", "prj_a00000000000000000000000"])?.operationId,
    ).toBe("getProject");
    expect(matchSpecOperation("GET", ["health"])?.operationId).toBe("getHealth");
    expect(matchSpecOperation("PUT", ["health"])).toBeUndefined();
  });
});
