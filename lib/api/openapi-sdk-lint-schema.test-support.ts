/**
 * Schema rules of the `x-bisibility-*` lint: what an SDK generator needs on every schema it
 * emits. A walk reports problems as `<code> <pointer>` strings under a subject (an operation, a
 * component schema or a component parameter) and the component schemas it references.
 */

export type Json = Record<string, unknown>;
export type Direction = "request" | "response";

export type SdkDocument = {
  components: { parameters?: Record<string, Json>; schemas: Record<string, Json> };
  paths: Record<string, Record<string, unknown>>;
};

export type WalkContext = {
  /** Inside a constraint union branch, `not` or `if`/`then`/`else`: validation, not a type. */
  constraint?: boolean;
  direction: Direction;
  /** The type is named by its parent (a nullable union or `allOf` that carries the name). */
  namedByParent?: boolean;
  pointer: string;
  /** The schema is a component root, named by its component key. */
  root?: boolean;
};

export type WalkSink = {
  problem: (problem: string) => void;
  reference: (component: string, direction: Direction) => void;
};

const schemaRef = "#/components/schemas/";
export const moneyField = /(?:^|_)cents$|_usd$/;
const anyPublicIdPattern = /^\^([a-z]+)_\[a-z\]\[a-z0-9\]\{23\}/;

export const isJson = (value: unknown): value is Json =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

export function referencedComponent(schema: Json) {
  const ref = schema.$ref;
  return typeof ref === "string" && ref.startsWith(schemaRef)
    ? ref.slice(schemaRef.length)
    : undefined;
}

export function resolveSchema(document: SdkDocument, schema: Json): Json {
  const name = referencedComponent(schema);
  return name ? resolveSchema(document, document.components.schemas[name] ?? {}) : schema;
}

const isNull = (schema: unknown) => isJson(schema) && schema.type === "null";

export function unionMembers(schema: Json) {
  const members = (schema.oneOf ?? schema.anyOf) as unknown[] | undefined;
  return Array.isArray(members) ? members : undefined;
}

/** The members of a `oneOf`/`anyOf` that are not just `null`. */
export function nonNullMembers(schema: Json) {
  return (unionMembers(schema) ?? []).filter((member) => !isNull(member)).filter(isJson);
}

function unionStyle(schema: Json) {
  const union = schema["x-bisibility-union"];
  return isJson(union) ? union.style : undefined;
}

export function isEnumSchema(schema: Json) {
  return Array.isArray(schema.enum) && schema.enum.some((value) => value !== null);
}

/** A schema a generator emits as its own type, so an inline one needs a name. */
function isTypeSchema(schema: Json) {
  const properties = schema.properties;
  return (
    (isJson(properties) && Object.keys(properties).length > 0) ||
    isEnumSchema(schema) ||
    (Array.isArray(schema.allOf) && schema.allOf.length > 0) ||
    (nonNullMembers(schema).length > 1 && unionStyle(schema) !== "constraint")
  );
}

const hasMoney = (schema: Json): boolean =>
  "x-bisibility-money" in schema ||
  (nonNullMembers(schema).length === 1 && hasMoney(nonNullMembers(schema)[0]));

function checkNode(schema: Json, context: WalkContext, sink: WalkSink) {
  const at = context.pointer || "/";
  if (!context.constraint && !context.root && !context.namedByParent) {
    if (isTypeSchema(schema) && !("x-bisibility-name" in schema)) sink.problem(`unnamed ${at}`);
  }
  if (isEnumSchema(schema)) {
    if (!("x-bisibility-enum" in schema)) sink.problem(`enum-without-kind ${at}`);
    if (schema["x-bisibility-enum"] === "closed" && context.direction === "response") {
      sink.problem(`closed-enum-in-response ${at}`);
    }
  }
  if (
    nonNullMembers(schema).length > 1 &&
    !("discriminator" in schema) &&
    !("x-bisibility-union" in schema)
  ) {
    sink.problem(`union-without-cases ${at}`);
  }
  const pattern = typeof schema.pattern === "string" ? schema.pattern : "";
  if (anyPublicIdPattern.test(pattern) && !("x-bisibility-public-id" in schema)) {
    sink.problem(`public-id-without-prefix ${at}`);
  }
}

/** Walks one schema, reporting problems and component references. */
export function walkSchema(schema: unknown, context: WalkContext, sink: WalkSink): void {
  if (!isJson(schema)) return;
  const component = referencedComponent(schema);
  if (component) {
    sink.reference(component, context.direction);
    return;
  }
  checkNode(schema, context, sink);
  const child = (value: unknown, suffix: string, overrides: Partial<WalkContext> = {}) =>
    walkSchema(
      value,
      {
        constraint: context.constraint,
        direction: context.direction,
        pointer: `${context.pointer}/${suffix}`,
        ...overrides,
      },
      sink,
    );
  const named = "x-bisibility-name" in schema || Boolean(context.root || context.namedByParent);

  if (isJson(schema.properties)) {
    for (const [name, property] of Object.entries(schema.properties)) {
      if (moneyField.test(name) && isJson(property) && !hasMoney(property)) {
        sink.problem(`money-without-kind ${context.pointer}/properties/${name}`);
      }
      child(property, `properties/${name}`);
    }
  }
  if (isJson(schema.patternProperties)) {
    for (const [name, value] of Object.entries(schema.patternProperties)) {
      child(value, `patternProperties/${name}`);
    }
  }
  if (isJson(schema.additionalProperties))
    child(schema.additionalProperties, "additionalProperties");
  const each = (keyword: string, overrides: Partial<WalkContext> = {}) => {
    const members = schema[keyword];
    if (!Array.isArray(members)) return;
    for (const [i, member] of members.entries()) child(member, `${keyword}/${i}`, overrides);
  };
  if (Array.isArray(schema.items)) each("items");
  else child(schema.items, "items");
  each("prefixItems");
  each("allOf", { namedByParent: true });
  const members = unionMembers(schema);
  if (members) {
    const constraint = unionStyle(schema) === "constraint";
    const nullable = nonNullMembers(schema).length === 1;
    each(schema.oneOf ? "oneOf" : "anyOf", {
      ...(constraint ? { constraint: true } : {}),
      ...(nullable && named ? { namedByParent: true } : {}),
    });
  }
  for (const keyword of ["not", "if", "then", "else"]) {
    child(schema[keyword], keyword, { constraint: true });
  }
}
