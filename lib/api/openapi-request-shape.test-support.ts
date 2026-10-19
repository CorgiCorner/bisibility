/**
 * Reduces a JSON Schema (an OpenAPI request schema or the output of `z.toJSONSchema`) to the
 * request shape the conformance suite compares: declared properties, the required set, enum
 * values, numeric, string and array bounds, and array items. Types, formats, defaults,
 * descriptions and `additionalProperties` are dropped. Both sides go through the same reduction,
 * so composition is handled the same way for the spec and the validator:
 *
 * - `anyOf`/`oneOf` branches are merged as a union: every property of any branch, required only
 *   when every object branch requires it, an enum only when every branch has one, a bound only
 *   when every branch declares the same one. `null` branches are dropped (nullability is a type).
 * - `allOf` members and keywords beside a composition are merged as an intersection.
 */

export type BoundKey = (typeof boundKeys)[number];

export type Shape = {
  bounds: Partial<Record<BoundKey, number | string>>;
  enum?: Set<string>;
  items?: Shape;
  /** Read by hand next to a schema: only its name is compared. */
  opaque?: boolean;
  /** Undefined when the schema declares no properties (an open or non-object schema). */
  properties?: Map<string, Shape>;
  required: Set<string>;
};

export const boundKeys = [
  "exclusiveMaximum",
  "exclusiveMinimum",
  "maxItems",
  "maxLength",
  "maximum",
  "minItems",
  "minLength",
  "minimum",
  "pattern",
] as const;

type JsonSchema = Record<string, unknown>;

const maxDepth = 24;

const emptyShape = (): Shape => ({ bounds: {}, required: new Set() });

function isRecord(value: unknown): value is JsonSchema {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function resolvePointer(root: unknown, ref: string): unknown {
  if (!ref.startsWith("#/")) return undefined;
  let current: unknown = root;
  for (const raw of ref.slice(2).split("/")) {
    const segment = raw.replaceAll("~1", "/").replaceAll("~0", "~");
    current = isRecord(current) ? current[segment] : undefined;
  }
  return current;
}

function isNullOnly(schema: unknown): boolean {
  if (!isRecord(schema)) return false;
  if (schema.type === "null") return true;
  if (schema.const === null) return true;
  return (
    Array.isArray(schema.enum) && schema.enum.length > 0 && schema.enum.every((v) => v === null)
  );
}

function enumOf(schema: JsonSchema): Set<string> | undefined {
  // A boolean is the two-value enum it is on the wire (`"true"`/`"false"` in a query string).
  const values =
    "const" in schema
      ? [schema.const]
      : Array.isArray(schema.enum)
        ? schema.enum
        : schema.type === "boolean"
          ? [false, true]
          : null;
  if (!values) return undefined;
  const kept = values.filter((value) => value !== null).map((value) => JSON.stringify(value));
  return kept.length > 0 ? new Set(kept) : undefined;
}

function boundsOf(schema: JsonSchema): Shape["bounds"] {
  const bounds: Shape["bounds"] = {};
  for (const key of boundKeys) {
    const value = schema[key];
    // z.number().int() emits the safe-integer range; it is not a declared bound.
    if (typeof value === "number" && Math.abs(value) < Number.MAX_SAFE_INTEGER) bounds[key] = value;
    if (typeof value === "string") bounds[key] = value;
  }
  // OpenAPI 3.0 boolean form: `exclusiveMinimum: true` qualifies `minimum`.
  for (const [flag, bound] of [
    ["exclusiveMinimum", "minimum"],
    ["exclusiveMaximum", "maximum"],
  ] as const) {
    if (schema[flag] === true && typeof bounds[bound] === "number") {
      bounds[flag] = bounds[bound];
      delete bounds[bound];
    }
  }
  // For integers an exclusive bound is the inclusive bound one step inward
  // (`z.number().int().positive()` emits `exclusiveMinimum: 0` for the spec's `minimum: 1`).
  const types = Array.isArray(schema.type) ? schema.type : [schema.type];
  if (types.includes("integer")) {
    for (const [flag, bound, step] of [
      ["exclusiveMinimum", "minimum", 1],
      ["exclusiveMaximum", "maximum", -1],
    ] as const) {
      const value = bounds[flag];
      if (typeof value !== "number") continue;
      const inclusive = value + step;
      const current = bounds[bound];
      bounds[bound] =
        typeof current === "number"
          ? step > 0
            ? Math.max(current, inclusive)
            : Math.min(current, inclusive)
          : inclusive;
      delete bounds[flag];
    }
  }
  // zod derives a pattern from string formats (email, uuid, ...); the format itself is a type.
  if (typeof schema.format === "string") delete bounds.pattern;
  return bounds;
}

function ownShape(schema: JsonSchema, root: unknown, depth: number): Shape {
  const shape: Shape = { bounds: boundsOf(schema), required: new Set() };
  const values = enumOf(schema);
  if (values) shape.enum = values;
  if (isRecord(schema.properties)) {
    shape.properties = new Map(
      Object.entries(schema.properties).map(([name, child]) => [
        name,
        reduceSchema(child, root, depth + 1),
      ]),
    );
    if (Array.isArray(schema.required)) {
      for (const name of schema.required) if (typeof name === "string") shape.required.add(name);
    }
  }
  if (schema.items !== undefined && typeof schema.items !== "boolean") {
    shape.items = reduceSchema(schema.items, root, depth + 1);
  }
  return shape;
}

/** A union declares a bound only when every branch declares that same bound. */
function agreed<T>(values: (T | undefined)[]): T | undefined {
  const [first] = values;
  return first !== undefined && values.every((value) => value === first) ? first : undefined;
}

export function unionShapes(shapes: Shape[]): Shape {
  if (shapes.length === 0) return emptyShape();
  if (shapes.length === 1) return shapes[0];
  const merged = emptyShape();
  for (const key of boundKeys) {
    const value = agreed(shapes.map((shape) => shape.bounds[key]));
    if (value !== undefined) merged.bounds[key] = value;
  }
  if (shapes.every((shape) => shape.enum)) {
    merged.enum = new Set(shapes.flatMap((shape) => [...(shape.enum ?? [])]));
  }
  const objects = shapes.filter((shape) => shape.properties);
  if (objects.length > 0) {
    const names = new Set(objects.flatMap((shape) => [...(shape.properties?.keys() ?? [])]));
    merged.properties = new Map(
      [...names].map((name) => [
        name,
        unionShapes(objects.flatMap((shape) => shape.properties?.get(name) ?? [])),
      ]),
    );
    for (const name of names) {
      if (objects.every((shape) => shape.required.has(name))) merged.required.add(name);
    }
  }
  const items = shapes.flatMap((shape) => shape.items ?? []);
  if (items.length > 0) merged.items = unionShapes(items);
  return merged;
}

export function intersectShapes(shapes: Shape[]): Shape {
  if (shapes.length === 0) return emptyShape();
  if (shapes.length === 1) return shapes[0];
  const merged = emptyShape();
  for (const shape of shapes) {
    for (const key of boundKeys) {
      if (merged.bounds[key] === undefined && shape.bounds[key] !== undefined) {
        merged.bounds[key] = shape.bounds[key];
      }
    }
    if (shape.enum) {
      merged.enum = merged.enum
        ? new Set([...merged.enum].filter((value) => shape.enum?.has(value)))
        : new Set(shape.enum);
    }
    for (const name of shape.required) merged.required.add(name);
  }
  const objects = shapes.filter((shape) => shape.properties);
  if (objects.length > 0) {
    const names = new Set(objects.flatMap((shape) => [...(shape.properties?.keys() ?? [])]));
    merged.properties = new Map(
      [...names].map((name) => [
        name,
        intersectShapes(objects.flatMap((shape) => shape.properties?.get(name) ?? [])),
      ]),
    );
  }
  const items = shapes.flatMap((shape) => shape.items ?? []);
  if (items.length > 0) merged.items = intersectShapes(items);
  return merged;
}

/** Reduces `schema` to its request shape; `$ref`s resolve against `root`. */
export function reduceSchema(schema: unknown, root: unknown, depth = 0): Shape {
  if (!isRecord(schema) || depth > maxDepth) return emptyShape();
  if (typeof schema.$ref === "string") {
    const { $ref, ...siblings } = schema;
    const target = reduceSchema(resolvePointer(root, $ref), root, depth + 1);
    return Object.keys(siblings).length > 0
      ? intersectShapes([target, reduceSchema(siblings, root, depth + 1)])
      : target;
  }
  const parts = [ownShape(schema, root, depth)];
  for (const keyword of ["anyOf", "oneOf"] as const) {
    const branches = schema[keyword];
    if (!Array.isArray(branches)) continue;
    const kept = branches.filter((branch) => !isNullOnly(branch));
    parts.push(unionShapes(kept.map((branch) => reduceSchema(branch, root, depth + 1))));
  }
  if (Array.isArray(schema.allOf)) {
    parts.push(...schema.allOf.map((member) => reduceSchema(member, root, depth + 1)));
  }
  return intersectShapes(parts);
}

/**
 * Copies enum values and bounds that `target` lacks from `source`, recursively. Used to add the
 * constraints a zod pipe enforces on its output (`z.coerce.number().pipe(z.literal(...))`) to the
 * input shape, which carries only the coercion.
 */
export function fillConstraints(target: Shape, source: Shape) {
  for (const key of boundKeys) {
    if (target.bounds[key] === undefined && source.bounds[key] !== undefined) {
      target.bounds[key] = source.bounds[key];
    }
  }
  if (!target.enum && source.enum) target.enum = new Set(source.enum);
  for (const [name, child] of target.properties ?? []) {
    const other = source.properties?.get(name);
    if (other) fillConstraints(child, other);
  }
  if (target.items && source.items) fillConstraints(target.items, source.items);
}

/** Query values arrive as strings, so `1` and `"1"`, `true` and `"true"` are the same value. */
export function queryValueShape(shape: Shape): Shape {
  return {
    ...shape,
    enum:
      shape.enum &&
      new Set([...shape.enum].map((value) => JSON.stringify(String(JSON.parse(value))))),
    items: shape.items && queryValueShape(shape.items),
    properties:
      shape.properties &&
      new Map([...shape.properties].map(([name, child]) => [name, queryValueShape(child)])),
  };
}
