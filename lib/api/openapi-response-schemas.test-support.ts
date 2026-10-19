import Ajv2020, { type ErrorObject, type ValidateFunction } from "ajv/dist/2020";
import { sdkSchemaExtensionKeys } from "./openapi-sdk-schema";

/**
 * Builds Ajv 2020 validators for OpenAPI response schemas, as a JSON Schema 2020-12 consumer
 * such as an SDK generator reads them:
 *
 * - `nullable` is an OpenAPI 3.0 keyword with no meaning in 3.1, so it is removed. A boolean
 *   `exclusiveMinimum`/`exclusiveMaximum` (also 3.0) is read as the 3.0 author meant it: the
 *   adjacent `minimum`/`maximum` becomes exclusive. Ajv 2020 rejects the boolean form outright.
 * - A "closed" variant adds `unevaluatedProperties: false` to every object position that does not
 *   declare `additionalProperties` or `unevaluatedProperties`. It sits on the position (response
 *   root, property, array item, map value), never on an `allOf`/`anyOf`/`oneOf` member or a
 *   component definition, so properties declared by any composed or referenced schema count as
 *   evaluated. The spec itself is not changed.
 */

type Schema = Record<string, unknown>;
type OpenApiDocument = { components: { schemas: Record<string, unknown> } };

const componentsId = "bisibility-openapi-components";
const componentPrefix = "#/components/schemas/";
const positionMaps = new Set(["properties", "patternProperties", "dependentSchemas"]);
const positionSchemas = new Set([
  "additionalProperties",
  "contains",
  "items",
  "propertyNames",
  "unevaluatedItems",
]);
const compositions = new Set(["allOf", "anyOf", "oneOf"]);
const inPlace = new Set(["else", "if", "not", "then"]);
const exclusiveBounds: Record<string, "maximum" | "minimum"> = {
  exclusiveMaximum: "maximum",
  exclusiveMinimum: "minimum",
};

const isSchema = (value: unknown): value is Schema =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function declaresObject(schema: Schema) {
  const type = schema.type;
  return (
    type === "object" ||
    (Array.isArray(type) && type.includes("object")) ||
    isSchema(schema.properties) ||
    isSchema(schema.patternProperties)
  );
}

function mayBeObject(
  schema: Schema,
  components: Record<string, unknown>,
  seen: Set<string>,
): boolean {
  if (declaresObject(schema)) return true;
  const ref = schema.$ref;
  if (typeof ref === "string" && ref.startsWith(componentPrefix) && !seen.has(ref)) {
    seen.add(ref);
    const target = components[ref.slice(componentPrefix.length)];
    if (isSchema(target) && mayBeObject(target, components, seen)) return true;
  }
  return [...compositions].some((keyword) => {
    const members = schema[keyword];
    return (
      Array.isArray(members) &&
      members.some((member) => isSchema(member) && mayBeObject(member, components, seen))
    );
  });
}

function transform(
  schema: unknown,
  position: boolean,
  closed: boolean,
  components: Record<string, unknown>,
): unknown {
  if (!isSchema(schema)) return schema;
  const next: Schema = {};
  for (const [keyword, value] of Object.entries(schema)) {
    if (keyword === "nullable") continue;
    const bound = exclusiveBounds[keyword];
    if (bound && typeof value === "boolean") {
      if (value && typeof schema[bound] === "number") next[keyword] = schema[bound];
      continue;
    }
    if (
      (keyword === "minimum" && schema.exclusiveMinimum === true) ||
      (keyword === "maximum" && schema.exclusiveMaximum === true)
    ) {
      continue;
    }
    if (keyword === "$ref" && typeof value === "string" && value.startsWith(componentPrefix)) {
      next.$ref = `${componentsId}#/$defs/${value.slice(componentPrefix.length)}`;
    } else if (positionMaps.has(keyword) && isSchema(value)) {
      next[keyword] = Object.fromEntries(
        Object.entries(value).map(([name, member]) => [
          name,
          transform(member, true, closed, components),
        ]),
      );
    } else if (positionSchemas.has(keyword) && isSchema(value)) {
      next[keyword] = transform(value, true, closed, components);
    } else if (keyword === "prefixItems" && Array.isArray(value)) {
      next[keyword] = value.map((member) => transform(member, true, closed, components));
    } else if (compositions.has(keyword) && Array.isArray(value)) {
      next[keyword] = value.map((member) => transform(member, false, closed, components));
    } else if (inPlace.has(keyword)) {
      next[keyword] = transform(value, false, closed, components);
    } else {
      next[keyword] = value;
    }
  }
  if (
    closed &&
    position &&
    !("additionalProperties" in next) &&
    !("unevaluatedProperties" in next) &&
    mayBeObject(schema, components, new Set())
  ) {
    next.unevaluatedProperties = false;
  }
  return next;
}

const dateTime = /^\d{4}-\d{2}-\d{2}[Tt]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:[Zz]|[+-]\d{2}:\d{2})$/;
const formats: Record<string, (value: string) => boolean> = {
  date: (value) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)),
  "date-time": (value) => dateTime.test(value) && !Number.isNaN(Date.parse(value)),
  email: (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value),
  uri: (value) => URL.canParse(value),
  uuid: (value) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value),
};

function createAjv(document: OpenApiDocument, closed: boolean) {
  const ajv = new Ajv2020({
    allErrors: true,
    strict: true,
    strictRequired: false,
    strictTypes: false,
  });
  for (const keyword of ["discriminator", "example", ...sdkSchemaExtensionKeys]) {
    ajv.addKeyword(keyword);
  }
  for (const [name, validate] of Object.entries(formats)) ajv.addFormat(name, validate);
  const components = document.components.schemas;
  ajv.addSchema({
    $defs: Object.fromEntries(
      Object.entries(components).map(([name, schema]) => [
        name,
        transform(schema, false, closed, components),
      ]),
    ),
    $id: componentsId,
  });
  return ajv;
}

export type ResponseValidator = { closed: ValidateFunction; open: ValidateFunction };

export function responseValidatorFactory(document: OpenApiDocument) {
  const open = createAjv(document, false);
  const closed = createAjv(document, true);
  const components = document.components.schemas;
  const cache = new Map<unknown, ResponseValidator>();
  return (schema: unknown): ResponseValidator => {
    let validator = cache.get(schema);
    if (!validator) {
      validator = {
        closed: closed.compile(transform(schema, true, true, components) as Schema),
        open: open.compile(transform(schema, true, false, components) as Schema),
      };
      cache.set(schema, validator);
    }
    return validator;
  };
}

export type { ErrorObject };
