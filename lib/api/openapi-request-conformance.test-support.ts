import { z } from "zod";
import {
  boundKeys,
  fillConstraints,
  queryValueShape,
  reduceSchema,
  type Shape,
} from "./openapi-request-shape.test-support";
import { type ConformanceDocument, operationsById } from "./openapi-response-findings.test-support";
import type { InputSource, OperationInput } from "./operation-input-helpers";
import { camelizeKeys, snakeizeKeys } from "./surface";

/**
 * Compares the request shape the OpenAPI document declares for each operation with the input
 * validation its handler registers in `operationInputs`. Shape only: property names, the required
 * set, enum values and bounds. Path parameters, headers and the router-level `project` query
 * parameter are out of scope, and so are `transform`, `refine` and `superRefine`.
 */

export type RequestConformanceKind =
  | "bound-mismatch"
  | "enum-mismatch"
  | "no-validator"
  | "raw-body"
  | "raw-query"
  | "required-mismatch"
  | "schema-not-convertible"
  | "spec-missing-body"
  | "spec-missing-field"
  | "validator-missing-body"
  | "validator-missing-field";

export type RequestLocation = "body" | "operation" | "query";

export type RequestConformanceEntry = {
  detail?: string;
  kind: RequestConformanceKind;
  location: RequestLocation;
  operation: string;
  path?: string;
};

type JsonSchema = Record<string, unknown>;
type Parameter = {
  $ref?: string;
  in?: string;
  name?: string;
  required?: boolean;
  schema?: unknown;
};
type RequestOperation = {
  parameters?: Parameter[];
  requestBody?: { content?: Record<string, { schema?: unknown }> };
};
type Emit = (entry: Omit<RequestConformanceEntry, "operation">) => void;
type ShapeEmit = (entry: Omit<RequestConformanceEntry, "location" | "operation">) => void;

/** Selected by the router for personal access tokens; not part of any handler's input. */
const routerQueryParameters = new Set(["project"]);

const compareText = (left: string, right: string) => (left < right ? -1 : left > right ? 1 : 0);
const camelName = (name: string) => Object.keys(camelizeKeys({ [name]: 0 }) as object)[0];
const snakeName = (name: string) => Object.keys(snakeizeKeys({ [name]: 0 }) as object)[0];

function resolveParameter(document: ConformanceDocument, parameter: Parameter): Parameter {
  if (!parameter.$ref) return parameter;
  const name = parameter.$ref.split("/").pop() ?? "";
  const components = (document.components as { parameters?: Record<string, Parameter> }).parameters;
  return components?.[name] ?? parameter;
}

/** The spec's JSON body schema, or undefined when the operation declares no request body. */
export function specBodySchema(operation: RequestOperation): unknown {
  const content = operation.requestBody?.content;
  if (!content) return undefined;
  return (content["application/json"] ?? Object.values(content)[0])?.schema ?? {};
}

/** The spec's query parameters as one object schema, or undefined when it declares none. */
export function specQuerySchema(
  document: ConformanceDocument,
  operation: RequestOperation,
): JsonSchema | undefined {
  const query = (operation.parameters ?? [])
    .map((parameter) => resolveParameter(document, parameter))
    .filter((parameter) => parameter.in === "query" && parameter.name)
    .filter((parameter) => !routerQueryParameters.has(parameter.name ?? ""));
  if (query.length === 0) return undefined;
  return {
    properties: Object.fromEntries(query.map(({ name, schema }) => [name, schema ?? {}])),
    required: query.filter((parameter) => parameter.required).map(({ name }) => name),
    type: "object",
  };
}

/** `z.toJSONSchema` for request input; unrepresentable parts become `{}` after a failure. */
export function validatorJsonSchema(schema: z.ZodType): {
  error?: string;
  json?: unknown;
  output?: unknown;
} {
  let output: unknown;
  try {
    output = z.toJSONSchema(schema, { io: "output", unrepresentable: "any" });
  } catch {
    output = undefined;
  }
  try {
    return { json: z.toJSONSchema(schema, { io: "input" }), output };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    try {
      const json = z.toJSONSchema(schema, { io: "input", unrepresentable: "any" });
      return { error: message, json, output };
    } catch {
      return { error: message };
    }
  }
}

const shown = (values?: Set<string>) =>
  values ? `[${[...values].sort(compareText).join(",")}]` : "any";

type Naming = { aliases: Readonly<Record<string, string>>; camel: boolean };

/** The validator key that receives the wire property `name`. */
function validatorKey(name: string, naming: Naming, top: boolean, parent: string[] = []) {
  const alias = naming.aliases[[...parent, name].join(".")];
  if (alias && (top || parent.length > 0)) return alias;
  return naming.camel ? camelName(name) : name;
}

function compareShapes(
  spec: Shape,
  validator: Shape,
  path: string[],
  naming: Naming,
  emit: ShapeEmit,
) {
  if (spec.opaque || validator.opaque) return;
  const at = path.length > 0 ? { path: path.join(".") } : {};
  if ((spec.enum || validator.enum) && shown(spec.enum) !== shown(validator.enum)) {
    emit({
      ...at,
      detail: `spec=${shown(spec.enum)} validator=${shown(validator.enum)}`,
      kind: "enum-mismatch",
    });
  }
  const bounds = boundKeys
    .filter((key) => spec.bounds[key] !== validator.bounds[key])
    .map(
      (key) =>
        `${key} spec=${spec.bounds[key] ?? "none"} validator=${validator.bounds[key] ?? "none"}`,
    );
  if (bounds.length > 0) emit({ ...at, detail: bounds.join("; "), kind: "bound-mismatch" });
  if (spec.items && validator.items) {
    const last = path.length > 0 ? path.slice(0, -1).concat(`${path.at(-1)}[]`) : ["[]"];
    compareShapes(spec.items, validator.items, last, naming, emit);
  }
  if (!spec.properties || !validator.properties) return;
  const top = path.length === 0;
  const matched = new Set<string>();
  for (const [name, specChild] of spec.properties) {
    const key = validatorKey(name, naming, top, path);
    const validatorChild = validator.properties.get(key);
    const childPath = [...path, name];
    if (!validatorChild) {
      emit({ kind: "validator-missing-field", path: childPath.join(".") });
      continue;
    }
    matched.add(key);
    const specRequired = spec.required.has(name);
    if (!validatorChild.opaque && specRequired !== validator.required.has(key)) {
      const state = (required: boolean) => (required ? "required" : "optional");
      emit({
        detail: `spec=${state(specRequired)} validator=${state(!specRequired)}`,
        kind: "required-mismatch",
        path: childPath.join("."),
      });
    }
    compareShapes(specChild, validatorChild, childPath, naming, emit);
  }
  for (const key of validator.properties.keys()) {
    if (matched.has(key)) continue;
    const wire = naming.camel ? snakeName(key) : key;
    emit({ kind: "spec-missing-field", path: [...path, wire].join(".") });
  }
}

const emptyObject = (): Shape => ({ bounds: {}, properties: new Map(), required: new Set() });

/** Keeps only the top-level property names: raw reads carry names, not value constraints. */
const namesOnly = (shape: Shape): Shape => ({
  ...emptyObject(),
  properties: new Map([...(shape.properties?.keys() ?? [])].map((name) => [name, emptyObject()])),
});

function validatorShape(source: InputSource, emit: ShapeEmit, location: "body" | "query") {
  if (source.kind === "raw") {
    const fields = [...source.fields].sort(compareText);
    emit({ detail: `reads ${fields.join(", ") || "nothing"}`, kind: `raw-${location}` });
    return {
      naming: { aliases: {}, camel: false },
      shape: { ...emptyObject(), properties: new Map(fields.map((name) => [name, emptyObject()])) },
    };
  }
  const converted = validatorJsonSchema(source.schema);
  if (converted.error) emit({ detail: converted.error, kind: "schema-not-convertible" });
  if (converted.json === undefined) return undefined;
  const naming = { aliases: source.aliases ?? {}, camel: (source.keys ?? "camel") === "camel" };
  const shape = reduceSchema(converted.json, converted.json);
  if (converted.output) fillConstraints(shape, reduceSchema(converted.output, converted.output));
  for (const name of source.handlerDefaults ?? []) {
    shape.required.delete(validatorKey(name, naming, true));
  }
  for (const key of source.serverKeys ?? []) dropKey(shape, key.split("."));
  if (source.alsoReads?.length) {
    shape.properties ??= new Map();
    for (const name of source.alsoReads) {
      shape.properties.set(validatorKey(name, naming, true), { ...emptyObject(), opaque: true });
    }
  }
  return { naming, shape };
}

/** Removes a server-filled key: it is never part of the wire input. */
function dropKey(shape: Shape, path: string[]) {
  const [head, ...rest] = path;
  if (rest.length === 0) {
    shape.properties?.delete(head);
    shape.required.delete(head);
    return;
  }
  const child = shape.properties?.get(head);
  if (child) dropKey(child, rest);
}

function compareLocation(
  location: "body" | "query",
  specSchema: unknown,
  source: InputSource | undefined,
  root: unknown,
  emit: ShapeEmit,
) {
  const spec = specSchema === undefined ? undefined : reduceSchema(specSchema, root);
  if (!source) {
    if (location === "body" && spec) emit({ kind: "validator-missing-body" });
    for (const name of location === "query" ? (spec?.properties?.keys() ?? []) : []) {
      emit({ kind: "validator-missing-field", path: name });
    }
    return;
  }
  const validator = validatorShape(source, emit, location);
  if (!validator) return;
  const { naming, shape } = validator;
  if (location === "body" && !spec) {
    const fields = [...(shape.properties?.keys() ?? [])]
      .map((key) => (naming.camel ? snakeName(key) : key))
      .sort(compareText);
    emit({
      detail: `validator reads ${fields.join(", ") || "an open object"}`,
      kind: "spec-missing-body",
    });
    return;
  }
  const specShape = spec ?? emptyObject();
  if (source.kind === "raw") return compareShapes(namesOnly(specShape), shape, [], naming, emit);
  if (location === "body") return compareShapes(specShape, shape, [], naming, emit);
  compareShapes(queryValueShape(specShape), queryValueShape(shape), [], naming, emit);
}

export function requestFindings(
  document: ConformanceDocument,
  operationId: string,
  operation: RequestOperation,
  input: OperationInput | undefined,
): RequestConformanceEntry[] {
  const entries: RequestConformanceEntry[] = [];
  const emit: Emit = (entry) => entries.push({ operation: operationId, ...entry });
  if (!input) {
    emit({ kind: "no-validator", location: "operation" });
    return entries;
  }
  for (const location of ["body", "query"] as const) {
    const specSchema =
      location === "body" ? specBodySchema(operation) : specQuerySchema(document, operation);
    compareLocation(location, specSchema, input[location], document, (entry) =>
      emit({ ...entry, location }),
    );
  }
  return entries;
}

export const requestEntryKey = (entry: RequestConformanceEntry) =>
  [entry.operation, entry.location, entry.kind, entry.path ?? ""].join(" ");

export function evaluateRequestConformance(
  document: ConformanceDocument,
  registry: Readonly<Record<string, OperationInput>>,
): RequestConformanceEntry[] {
  return [...operationsById(document)]
    .flatMap(([operationId, operation]) =>
      requestFindings(document, operationId, operation as RequestOperation, registry[operationId]),
    )
    .sort((left, right) => compareText(requestEntryKey(left), requestEntryKey(right)));
}
