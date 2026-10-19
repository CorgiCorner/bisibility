import { describe, expect, it } from "vitest";
import { blockingSubjects, evaluateSdkExtensions } from "./openapi-sdk-lint.test-support";
import { pathParameterProblems } from "./openapi-sdk-lint-operations.test-support";
import type { Json, SdkDocument } from "./openapi-sdk-lint-schema.test-support";
import { extensionValueProblems } from "./openapi-sdk-lint-values.test-support";
import {
  closedEnum,
  constraintUnion,
  openEnum,
  publicIdUnion,
  sdkName,
  taggedUnion,
  usdCents,
  withPublicIdExtensions,
} from "./openapi-sdk-schema";

const complete = {
  "x-bisibility-cost": { kind: "free" },
  "x-bisibility-idempotency": "none",
  "x-bisibility-pagination": { style: "none" },
  "x-bisibility-sdk": {
    group: "things",
    legacy: { go: ["GetThing"], python: ["get_thing"], ts: ["getThing"] },
    method: "get",
  },
};

function documentWith(operation: Json, schemas: Record<string, Json> = {}): SdkDocument {
  return withPublicIdExtensions({
    components: {
      parameters: {
        Limit: { in: "query", name: "limit", schema: { maximum: 200, type: "integer" } },
      },
      schemas: { Thing: { properties: { id: { type: "string" } }, type: "object" }, ...schemas },
    },
    paths: { "/things": { get: { operationId: "getThing", ...operation } } },
  });
}

const json = (schema: Json) => ({
  responses: { "200": { content: { "application/json": { schema } } } },
});

const gaps = (document: SdkDocument) =>
  evaluateSdkExtensions(document).flatMap((entry) =>
    entry.problems.map((problem) => `${entry.subject}: ${problem}`),
  );

describe("x-bisibility gap rules", () => {
  it("passes a fully annotated operation", () => {
    const document = documentWith({
      ...complete,
      ...json({
        properties: {
          cost_cents: { type: "number", ...usdCents },
          state: { enum: ["a", "b"], type: "string", ...openEnum("ThingState") },
          thing: { $ref: "#/components/schemas/Thing" },
        },
        type: "object",
        ...sdkName("ThingResponse"),
      }),
    });
    expect(gaps(document)).toEqual([]);
    expect(extensionValueProblems(document)).toEqual([]);
  });

  it("reports missing operation extensions", () => {
    const { "x-bisibility-cost": _cost, ...partial } = complete;
    expect(gaps(documentWith({ ...partial, ...json({ type: "string" }) }))).toEqual([
      "operation getThing: missing x-bisibility-cost",
    ]);
  });

  it("reports unnamed inline types, unmarked enums and money, and closed response enums", () => {
    const document = documentWith({
      ...complete,
      ...json({
        properties: {
          cost_cents: { type: "number" },
          kind: { enum: ["a"], type: "string", ...closedEnum("Kind") },
          nested: { properties: { flag: { enum: ["x", "y"], type: "string" } }, type: "object" },
        },
        type: "object",
        ...sdkName("ThingResponse"),
      }),
    });
    expect(gaps(document)).toEqual([
      "operation getThing: closed-enum-in-response /responses/200 application/json/properties/kind",
      "operation getThing: enum-without-kind /responses/200 application/json/properties/nested/properties/flag",
      "operation getThing: money-without-kind /responses/200 application/json/properties/cost_cents",
      "operation getThing: unnamed /responses/200 application/json/properties/nested",
      "operation getThing: unnamed /responses/200 application/json/properties/nested/properties/flag",
    ]);
  });

  it("requires cases on unions, but not on nullable ones or constraint branches", () => {
    const union = { oneOf: [{ type: "string" }, { type: "integer" }] };
    const document = documentWith(
      { ...complete, ...json({ $ref: "#/components/schemas/Box" }) },
      {
        Box: {
          anyOf: [{ properties: { a: { const: 1 } }, required: ["b"] }, { required: ["a"] }],
          properties: {
            a: { type: "integer" },
            b: { type: "integer" },
            maybe: { oneOf: [{ $ref: "#/components/schemas/Thing" }, { type: "null" }] },
            value: union,
          },
          type: "object",
          ...constraintUnion,
        },
      },
    );
    expect(gaps(document)).toEqual([
      "operation getThing: schema Box",
      "schema Box: union-without-cases /properties/value",
      "schema Box: unnamed /properties/value",
    ]);
    expect(blockingSubjects(evaluateSdkExtensions(document), "getThing")).toEqual([
      "operation getThing",
      "schema Box",
    ]);
  });

  it("counts a component's gaps against every operation that reaches it", () => {
    const document = documentWith(
      { ...complete, ...json({ $ref: "#/components/schemas/Outer" }) },
      {
        Inner: { properties: { mode: { enum: ["a"], type: "string" } }, type: "object" },
        Outer: { properties: { inner: { $ref: "#/components/schemas/Inner" } }, type: "object" },
      },
    );
    expect(blockingSubjects(evaluateSdkExtensions(document), "getThing")).toEqual([
      "operation getThing",
      "schema Inner",
    ]);
  });
});

describe("x-bisibility value rules", () => {
  const problems = (operation: Json, schemas?: Record<string, Json>) =>
    extensionValueProblems(documentWith({ ...complete, ...operation }, schemas));

  it("rejects unknown keys and malformed values", () => {
    expect(
      problems(
        json({
          properties: {
            a: { type: "string", "x-bisibility-enum": "open" },
            b: { type: "string", ...usdCents },
            c: { type: "string", "x-bisibility-nickname": "C" },
          },
          type: "object",
          ...sdkName("lowercase"),
        }),
      ),
    ).toEqual([
      "invalid x-bisibility-enum /paths/~1things/get/responses/200/content/application~1json/schema/properties/a",
      "invalid x-bisibility-money /paths/~1things/get/responses/200/content/application~1json/schema/properties/b",
      "invalid x-bisibility-name /paths/~1things/get/responses/200/content/application~1json/schema",
      "unknown x-bisibility-nickname /paths/~1things/get/responses/200/content/application~1json/schema/properties/c",
    ]);
  });

  it("derives public-ID prefixes and checks public-ID unions", () => {
    const id = (prefix: string) => ({ pattern: `^${prefix}_[a-z][a-z0-9]{23}$`, type: "string" });
    const document = documentWith({
      ...complete,
      ...json({ oneOf: [id("kw"), id("tag")], ...publicIdUnion(["keyword", "tag"]) }),
    });
    expect(extensionValueProblems(document)).toEqual([]);
    expect(problems(json({ oneOf: [id("kw"), id("kw")], ...publicIdUnion(["a", "b"]) }))).toEqual([
      "invalid x-bisibility-union /paths/~1things/get/responses/200/content/application~1json/schema",
    ]);
  });

  it("checks tagged unions: distinct tags, at most one default case, one case name each", () => {
    const tagged = (value: unknown) => ({
      properties: { kind: { const: value }, x: { type: "string" } },
      type: "object",
    });
    const plain = { properties: { x: { type: "string" } }, type: "object" };
    const valid = { oneOf: [tagged(true), plain], ...taggedUnion("kind", ["a", "b"]) };
    expect(problems(json(valid))).toEqual([]);
    for (const invalid of [
      { oneOf: [plain, plain], ...taggedUnion("kind", ["a", "b"]) },
      { oneOf: [tagged(1), tagged(1)], ...taggedUnion("kind", ["a", "b"]) },
      { oneOf: [tagged(1), tagged(2)], ...taggedUnion("kind", ["a"]) },
      { oneOf: [tagged(1), tagged(2)], ...taggedUnion("kind", ["A", "b"]) },
    ]) {
      expect(problems(json(invalid))).toHaveLength(1);
    }
  });

  it("rejects one name for two shapes, and a name that shadows a component", () => {
    const named = (name: string, values: string[]) => ({
      enum: values,
      type: "string",
      ...openEnum(name),
    });
    const document = json({
      properties: { a: named("Mode", ["x"]), b: named("Mode", ["y"]), c: named("Thing", ["z"]) },
      type: "object",
      ...sdkName("Holder"),
    });
    expect(problems(document)).toEqual([
      "name-conflict Mode",
      "name-is-a-component Thing /paths/~1things/get/responses/200/content/application~1json/schema/properties/c",
    ]);
  });

  it("checks pagination, idempotency and cost against the operation", () => {
    const page = {
      properties: {
        data: { items: { type: "string" }, type: "array" },
        meta: { properties: { next_cursor: { type: ["string", "null"] } }, type: "object" },
      },
      type: "object",
    };
    const paged = {
      ...json(page),
      parameters: [
        { $ref: "#/components/parameters/Limit" },
        { in: "query", name: "cursor", schema: { type: "string" } },
        { in: "query", name: "estimate_only", schema: { type: "boolean" } },
        { in: "query", name: "max_cost_cents", schema: { minimum: 1, type: "integer" } },
      ],
    };
    const cursor = (maxLimit: number) => ({
      "x-bisibility-pagination": {
        items: "data",
        max_limit: maxLimit,
        next: "meta.next_cursor",
        style: "cursor",
      },
    });
    expect(problems({ ...paged, ...cursor(200) })).toEqual([]);
    expect(problems({ ...paged, ...cursor(100) })).toEqual([
      "invalid x-bisibility-pagination getThing",
    ]);
    expect(problems({ ...paged, "x-bisibility-idempotency": "optional" })).toEqual([
      "invalid x-bisibility-idempotency getThing",
    ]);
    const paid = (minimum: number) => ({
      "x-bisibility-cost": {
        kind: "paid",
        max_cost_cents: { in: "query", minimum, required: false },
        timing: "inline",
      },
    });
    expect(problems({ ...paged, ...paid(1) })).toEqual([]);
    expect(problems({ ...paged, ...paid(0) })).toEqual(["invalid x-bisibility-cost getThing"]);
    const { timing: _timing, ...untimed } = paid(1)["x-bisibility-cost"];
    expect(problems({ ...paged, "x-bisibility-cost": untimed })).toEqual([
      "invalid x-bisibility-cost getThing",
    ]);
    expect(
      problems({
        ...paged,
        "x-bisibility-cost": {
          estimate: { in: "query", param: "estimate_only", response: "Thing" },
          kind: "paid",
          timing: "inline",
        },
      }),
    ).toEqual(["invalid x-bisibility-cost getThing"]);
  });
});

describe("x-bisibility path parameter rule", () => {
  const document = documentWith({});
  const project = {
    in: "path",
    name: "project_id",
    required: true,
    schema: { pattern: "^prj_[a-z][a-z0-9]{23}$", type: "string", "x-bisibility-public-id": "prj" },
  };
  const check = (path: string, parameters: object[]) =>
    pathParameterProblems(document, path, { operationId: "getThing", parameters });

  it("passes a declared public-ID placeholder", () => {
    expect(check("/projects/{project_id}", [project])).toEqual([]);
  });

  it("rejects undeclared, misnamed, plain-string and extra path parameters", () => {
    expect(check("/projects/{project_id}", [])).toEqual([
      "missing-path-parameter project_id getThing",
    ]);
    expect(check("/projects/{projectId}", [{ ...project, name: "projectId" }])).toEqual([
      "path-placeholder-not-snake-case projectId getThing",
    ]);
    expect(check("/projects/{project_id}", [{ ...project, schema: { type: "string" } }])).toEqual([
      "path-id-without-public-id project_id getThing",
    ]);
    expect(check("/projects", [project])).toEqual(["undeclared-placeholder project_id getThing"]);
    expect(check("/projects/{project_id}", [{ ...project, required: false }])).toEqual([
      "missing-path-parameter project_id getThing",
    ]);
  });
});
