import { describe, expect, it } from "vitest";
import { z } from "zod";
import { requestFindings } from "./openapi-request-conformance.test-support";
import { reduceSchema } from "./openapi-request-shape.test-support";
import { type OperationInput, rawInput, zodInput } from "./operation-input-helpers";

type Operation = Parameters<typeof requestFindings>[2];

const document = {
  components: {
    parameters: {
      ProjectQuery: { in: "query", name: "project", schema: { type: "string" } },
    },
    schemas: { Name: { maxLength: 120, minLength: 1, type: "string" } },
  },
  paths: {},
};

const body = (schema: unknown): Operation => ({
  requestBody: { content: { "application/json": { schema } } },
});

const query = (...parameters: object[]): Operation => ({ parameters: parameters as never });

const sortKey = (entry: object) => {
  const { kind, location, path } = entry as { kind: string; location: string; path?: string };
  return `${kind} ${location} ${path ?? ""}`;
};
const sorted = <T extends object>(entries: T[]) =>
  [...entries].sort((left, right) => sortKey(left).localeCompare(sortKey(right)));

function findings(operation: Operation, input: OperationInput | undefined) {
  return sorted(
    requestFindings(document, "op", operation, input).map(
      ({ operation: _operation, ...entry }) => entry,
    ),
  );
}

describe("request shape reduction", () => {
  it("merges unions, drops null branches and resolves references", () => {
    const shape = reduceSchema(
      {
        anyOf: [
          {
            properties: { a: { $ref: "#/components/schemas/Name" }, b: {} },
            required: ["a", "b"],
            type: "object",
          },
          { properties: { a: { type: "string" } }, required: ["a"], type: "object" },
          { type: "null" },
        ],
      },
      document,
    );
    expect([...(shape.properties?.keys() ?? [])]).toEqual(["a", "b"]);
    expect([...shape.required]).toEqual(["a"]);
    // Only one branch bounds `a`, so the union declares no bound.
    expect(shape.properties?.get("a")?.bounds).toEqual({});
  });

  it("drops zod's safe-integer range and the pattern a string format implies", () => {
    const shape = reduceSchema(z.toJSONSchema(z.object({ n: z.number().int(), e: z.email() })), {});
    expect(shape.properties?.get("n")?.bounds).toEqual({});
    expect(shape.properties?.get("e")?.bounds).toEqual({});
  });

  it("reads an exclusive integer bound as the inclusive bound one step inward", () => {
    const shape = reduceSchema(z.toJSONSchema(z.number().int().positive()), {});
    expect(shape.bounds).toEqual({ minimum: 1 });
  });
});

describe("request findings", () => {
  it("reports an operation without a registry entry", () => {
    expect(findings(body({}), undefined)).toEqual(
      sorted([{ kind: "no-validator", location: "operation" }]),
    );
  });

  it("matches camelized validator keys to snake_case wire names", () => {
    const spec = body({
      properties: { max_cost_cents: { minimum: 0, type: "integer" } },
      type: "object",
    });
    const input = {
      body: zodInput(z.object({ maxCostCents: z.number().int().min(0).optional() })),
    };
    expect(findings(spec, input)).toEqual([]);
  });

  it("checks bounds and requiredness through nested normalization aliases", () => {
    const spec = body({
      type: "object",
      properties: {
        schedule: {
          type: "object",
          required: ["jitter_minutes"],
          properties: { jitter_minutes: { type: "integer", minimum: 0, maximum: 120 } },
        },
      },
    });
    const input = {
      body: zodInput(
        z.object({
          schedule: z
            .object({
              jitterMinutes: z.number().int().min(0).max(120),
            })
            .optional(),
        }),
        { keys: "wire", aliases: { "schedule.jitter_minutes": "jitterMinutes" } },
      ),
    };
    expect(findings(spec, input)).toEqual([]);
    const drift = body({
      type: "object",
      properties: {
        schedule: {
          type: "object",
          properties: { jitter_minutes: { type: "integer", maximum: 60 } },
        },
      },
    });
    expect(findings(drift, input)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "bound-mismatch", path: "schedule.jitter_minutes" }),
        expect.objectContaining({ kind: "required-mismatch", path: "schedule.jitter_minutes" }),
      ]),
    );
  });

  it("reports missing fields, required, enum and bound mismatches", () => {
    const spec = body({
      properties: {
        mode: { enum: ["a", "b"], type: "string" },
        name: { $ref: "#/components/schemas/Name" },
        only_spec: { type: "string" },
      },
      required: ["name"],
      type: "object",
    });
    const validator = z.object({
      mode: z.enum(["a", "c"]),
      name: z.string().min(1).max(80).optional(),
      onlyValidator: z.string().optional(),
    });
    expect(findings(spec, { body: zodInput(validator) })).toEqual(
      sorted([
        {
          detail: 'spec=["a","b"] validator=["a","c"]',
          kind: "enum-mismatch",
          location: "body",
          path: "mode",
        },
        {
          detail: "spec=optional validator=required",
          kind: "required-mismatch",
          location: "body",
          path: "mode",
        },
        {
          detail: "spec=required validator=optional",
          kind: "required-mismatch",
          location: "body",
          path: "name",
        },
        {
          detail: "maxLength spec=120 validator=80",
          kind: "bound-mismatch",
          location: "body",
          path: "name",
        },
        { kind: "validator-missing-field", location: "body", path: "only_spec" },
        { kind: "spec-missing-field", location: "body", path: "only_validator" },
      ]),
    );
  });

  it("compares array items and nested objects", () => {
    const spec = body({
      properties: {
        items: {
          items: { properties: { tag: { maxLength: 48, type: "string" } }, type: "object" },
          maxItems: 10,
          type: "array",
        },
      },
      type: "object",
    });
    const validator = z.object({
      items: z.array(z.object({ tag: z.string().max(40) })).max(10),
    });
    expect(findings(spec, { body: zodInput(validator) })).toEqual(
      sorted([
        {
          detail: "maxLength spec=48 validator=40",
          kind: "bound-mismatch",
          location: "body",
          path: "items[].tag",
        },
        {
          detail: "spec=optional validator=required",
          kind: "required-mismatch",
          location: "body",
          path: "items",
        },
        {
          detail: "spec=optional validator=required",
          kind: "required-mismatch",
          location: "body",
          path: "items[].tag",
        },
      ]),
    );
  });

  it("reports a body the spec omits and a body the handler never reads", () => {
    const validator = z.object({ fooBar: z.string() });
    expect(findings({}, { body: zodInput(validator) })).toEqual(
      sorted([{ detail: "validator reads foo_bar", kind: "spec-missing-body", location: "body" }]),
    );
    expect(findings(body({ type: "object" }), {})).toEqual(
      sorted([{ kind: "validator-missing-body", location: "body" }]),
    );
  });

  it("records an unconvertible schema and still compares what converts", () => {
    const validator = z.object({ at: z.date(), name: z.string().max(5) });
    const spec = body({
      properties: { at: { type: "string" }, name: { maxLength: 9, type: "string" } },
      required: ["at", "name"],
      type: "object",
    });
    expect(findings(spec, { body: zodInput(validator) })).toEqual(
      sorted([
        {
          detail: "Date cannot be represented in JSON Schema",
          kind: "schema-not-convertible",
          location: "body",
        },
        {
          detail: "maxLength spec=9 validator=5",
          kind: "bound-mismatch",
          location: "body",
          path: "name",
        },
      ]),
    );
  });

  it("compares raw query reads by name only and ignores the router's project parameter", () => {
    const spec = query(
      { $ref: "#/components/parameters/ProjectQuery" },
      { in: "query", name: "limit", schema: { maximum: 100, type: "integer" } },
      { in: "query", name: "status", schema: { enum: ["a"], type: "string" } },
      { in: "header", name: "X-Trace", schema: { type: "string" } },
    );
    expect(findings(spec, { query: rawInput("cursor", "limit") })).toEqual(
      sorted([
        { detail: "reads cursor, limit", kind: "raw-query", location: "query" },
        { kind: "validator-missing-field", location: "query", path: "status" },
        { kind: "spec-missing-field", location: "query", path: "cursor" },
      ]),
    );
  });

  it("treats query values as strings and applies the constraints of a pipe's output", () => {
    const spec = query(
      { in: "query", name: "fresh", schema: { type: "boolean" } },
      { in: "query", name: "result_limit", schema: { enum: [100, 300], type: "integer" } },
    );
    const validator = z.object({
      fresh: z.enum(["true", "false"]).optional(),
      resultLimit: z.coerce
        .number()
        .pipe(z.union([z.literal(100), z.literal(300)]))
        .optional(),
    });
    expect(findings(spec, { query: zodInput(validator) })).toEqual([]);
  });

  it("applies aliases, server keys, handler defaults and hand-read names", () => {
    const spec = query(
      { in: "query", name: "q", required: true, schema: { minLength: 2, type: "string" } },
      { in: "query", name: "limit", schema: { type: "string" } },
      { in: "query", name: "cursor", required: true, schema: { maxLength: 9, type: "string" } },
    );
    const validator = z.object({
      limit: z.string(),
      projectId: z.string(),
      query: z.string().min(2),
    });
    const input = zodInput(validator, {
      aliases: { q: "query" },
      alsoReads: ["cursor"],
      handlerDefaults: ["limit"],
      serverKeys: ["projectId"],
    });
    expect(findings(spec, { query: input })).toEqual([]);
  });
});
