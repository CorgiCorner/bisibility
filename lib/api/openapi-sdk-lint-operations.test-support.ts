import { documentOperations } from "./openapi-sdk-lint.test-support";
import {
  isJson,
  type Json,
  referencedComponent,
  resolveSchema,
  type SdkDocument,
} from "./openapi-sdk-lint-schema.test-support";

/**
 * Operation-level `x-bisibility-*` values: well formed, and consistent with what the operation
 * declares (the estimate parameter exists, the cost cap has the declared minimum, pagination
 * matches the `limit` maximum and the response envelope, idempotency matches the header).
 */

const parameterRef = "#/components/parameters/";
const languages = {
  go: /^[A-Z][A-Za-z0-9]*$/,
  python: /^[a-z][a-z0-9_]*$/,
  ts: /^[a-z][A-Za-z0-9]*$/,
} as const;
const group = /^[a-z][A-Za-z0-9]*(?:\.[a-z][A-Za-z0-9]*)*$/;
const method = /^[a-z][A-Za-z0-9]*$/;

const onlyKeys = (value: Json, allowed: string[], required = allowed) =>
  Object.keys(value).every((key) => allowed.includes(key)) && required.every((key) => key in value);

function parameters(document: SdkDocument, operation: Json): Json[] {
  return ((operation.parameters as Json[] | undefined) ?? []).map((parameter) => {
    const ref = typeof parameter.$ref === "string" ? parameter.$ref : "";
    return ref.startsWith(parameterRef)
      ? (document.components.parameters?.[ref.slice(parameterRef.length)] ?? {})
      : parameter;
  });
}

const parameter = (document: SdkDocument, operation: Json, where: string, name: string) =>
  parameters(document, operation).find(
    (candidate) =>
      candidate.in === where && String(candidate.name).toLowerCase() === name.toLowerCase(),
  );

function bodySchema(document: SdkDocument, operation: Json) {
  const content = isJson(operation.requestBody) ? operation.requestBody.content : undefined;
  const json = isJson(content) ? content["application/json"] : undefined;
  return isJson(json) && isJson(json.schema) ? resolveSchema(document, json.schema) : undefined;
}

function successSchema(operation: Json) {
  const responses = isJson(operation.responses) ? operation.responses : {};
  const success = Object.entries(responses).find(([status]) => /^2\d\d$/.test(status))?.[1];
  const content = isJson(success) && isJson(success.content) ? success.content : {};
  const json = content["application/json"];
  return isJson(json) && isJson(json.schema) ? json.schema : undefined;
}

/** Component names reachable from a schema. */
function references(document: SdkDocument, schema: unknown, seen = new Set<string>()) {
  if (Array.isArray(schema)) for (const item of schema) references(document, item, seen);
  if (!isJson(schema)) return seen;
  const name = referencedComponent(schema);
  if (name && !seen.has(name)) {
    seen.add(name);
    references(document, document.components.schemas[name], seen);
  }
  for (const value of Object.values(schema)) references(document, value, seen);
  return seen;
}

function at(schema: Json | undefined, path: string, document: SdkDocument) {
  let node: Json | undefined = schema && resolveSchema(document, schema);
  for (const key of path.split(".")) {
    const next = node && isJson(node.properties) ? node.properties[key] : undefined;
    node = isJson(next) ? resolveSchema(document, next) : undefined;
  }
  return node;
}

function costValid(document: SdkDocument, operation: Json, cost: unknown) {
  if (!isJson(cost)) return false;
  if (cost.kind === "free") return onlyKeys(cost, ["kind"]);
  const allowed = ["estimate", "kind", "max_cost_cents", "timing"];
  if (cost.kind !== "paid" || !onlyKeys(cost, allowed, ["kind", "timing"])) return false;
  if (cost.timing !== "inline" && cost.timing !== "deferred") return false;
  const locate = (where: unknown, name: string) => {
    if (where === "query") return parameter(document, operation, "query", name);
    const body = where === "body" ? bodySchema(document, operation) : undefined;
    const property = body && isJson(body.properties) ? body.properties[name] : undefined;
    return isJson(property) ? { body, schema: property } : undefined;
  };
  const estimate = cost.estimate;
  if (estimate !== undefined) {
    if (!isJson(estimate) || !onlyKeys(estimate, ["in", "param", "response"], ["in", "param"])) {
      return false;
    }
    if (!locate(estimate.in, String(estimate.param))) return false;
    const reached = references(document, successSchema(operation));
    if (estimate.response !== undefined && !reached.has(String(estimate.response))) return false;
  }
  const cap = cost.max_cost_cents;
  if (cap === undefined) return true;
  if (!isJson(cap) || !onlyKeys(cap, ["in", "minimum", "required"])) return false;
  const found = locate(cap.in, "max_cost_cents");
  const schema = found && isJson(found.schema) ? found.schema : undefined;
  if (!schema || schema.minimum !== cap.minimum) return false;
  if (cap.in === "query") return Boolean(found?.required) === cap.required;
  const body = (found as { body: Json }).body;
  const requiredIn = (node: Json) =>
    Array.isArray(node.required) && node.required.includes("max_cost_cents");
  const branches = ((body.anyOf ?? body.oneOf ?? []) as Json[]).filter(isJson);
  return (requiredIn(body) || branches.some(requiredIn)) === cap.required;
}

function paginationValid(document: SdkDocument, operation: Json, pagination: unknown) {
  if (!isJson(pagination)) return false;
  if (pagination.style === "none") return onlyKeys(pagination, ["style"]);
  if (pagination.style !== "cursor") return false;
  if (!onlyKeys(pagination, ["items", "max_limit", "next", "style"])) return false;
  const limit = parameter(document, operation, "query", "limit");
  const limitSchema = limit && isJson(limit.schema) ? limit.schema : {};
  const response = successSchema(operation);
  const items = at(response, String(pagination.items), document);
  return (
    limitSchema.maximum === pagination.max_limit &&
    Boolean(parameter(document, operation, "query", "cursor")) &&
    items?.type === "array" &&
    Boolean(at(response, String(pagination.next), document))
  );
}

function idempotencyValid(document: SdkDocument, operation: Json, idempotency: unknown) {
  const header = parameter(document, operation, "header", "Idempotency-Key");
  if (idempotency === "none") return !header;
  if (idempotency === "optional") return Boolean(header) && !header?.required;
  return idempotency === "required" && header?.required === true;
}

function sdkValid(sdk: unknown) {
  if (!isJson(sdk) || !onlyKeys(sdk, ["group", "legacy", "method", "skip"], ["group", "method"])) {
    return false;
  }
  const legacy = sdk.legacy;
  return (
    group.test(String(sdk.group)) &&
    method.test(String(sdk.method)) &&
    (sdk.skip === undefined || typeof sdk.skip === "boolean") &&
    isJson(legacy) &&
    onlyKeys(legacy, Object.keys(languages)) &&
    Object.entries(languages).every(
      ([language, pattern]) =>
        Array.isArray(legacy[language]) &&
        (legacy[language] as unknown[]).every((name) => pattern.test(String(name))),
    )
  );
}

const placeholderName = /^[a-z][a-z0-9_]*$/;

/**
 * A generated client builds the URL from declared path parameters only: every placeholder is a
 * snake_case name with a required path parameter, and an ID placeholder has a public-ID schema.
 */
export function pathParameterProblems(document: SdkDocument, path: string, operation: Json) {
  const id = String(operation.operationId);
  const declared = parameters(document, operation).filter((candidate) => candidate.in === "path");
  const names = [...path.matchAll(/\{([^}]+)\}/g)].map((match) => match[1]);
  const problems = declared
    .filter((candidate) => !names.includes(String(candidate.name)))
    .map((candidate) => `undeclared-placeholder ${candidate.name} ${id}`);
  for (const name of names) {
    const parameter = declared.find((candidate) => candidate.name === name);
    const schema = parameter && isJson(parameter.schema) ? parameter.schema : undefined;
    if (!placeholderName.test(name)) problems.push(`path-placeholder-not-snake-case ${name} ${id}`);
    if (parameter?.required !== true) {
      problems.push(`missing-path-parameter ${name} ${id}`);
    } else if (/(^|_)id$/.test(name) && !schema?.["x-bisibility-public-id"]) {
      problems.push(`path-id-without-public-id ${name} ${id}`);
    }
  }
  return problems;
}

export function operationExtensionProblems(document: SdkDocument): string[] {
  const problems: string[] = [];
  const surfaces = new Map<string, string>();
  const legacyNames = new Map<string, string>();
  for (const { operation, path } of documentOperations(document)) {
    const id = String(operation.operationId);
    if ("x-bisibility-sdk" in operation) {
      problems.push(...pathParameterProblems(document, path, operation));
    }
    const check = (key: string, valid: (value: unknown) => boolean) => {
      if (key in operation && !valid(operation[key])) problems.push(`invalid ${key} ${id}`);
    };
    check("x-bisibility-sdk", sdkValid);
    check("x-bisibility-cost", (value) => costValid(document, operation, value));
    check("x-bisibility-idempotency", (value) => idempotencyValid(document, operation, value));
    check("x-bisibility-pagination", (value) => paginationValid(document, operation, value));
    const sdk = operation["x-bisibility-sdk"];
    if (!isJson(sdk)) continue;
    const surface = `${sdk.group}.${sdk.method}`;
    if (surfaces.has(surface)) problems.push(`duplicate-method ${surface}`);
    surfaces.set(surface, id);
    for (const [language, names] of Object.entries(isJson(sdk.legacy) ? sdk.legacy : {})) {
      for (const name of Array.isArray(names) ? names : []) {
        const key = `${language} ${name}`;
        if (legacyNames.has(key)) problems.push(`duplicate-legacy ${key}`);
        legacyNames.set(key, id);
      }
    }
  }
  return problems;
}
