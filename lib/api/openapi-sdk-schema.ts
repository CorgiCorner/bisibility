/**
 * Schema-level `x-bisibility-*` extensions: what an SDK generator cannot infer from JSON Schema.
 * The vocabulary is closed; `openapi-sdk-extensions.test.ts` rejects any other `x-bisibility-*`
 * key and checks every value.
 */

export const sdkOperationExtensionKeys = [
  "x-bisibility-sdk",
  "x-bisibility-cost",
  "x-bisibility-idempotency",
  "x-bisibility-pagination",
] as const;

export const sdkSchemaExtensionKeys = [
  "x-bisibility-public-id",
  "x-bisibility-money",
  "x-bisibility-enum",
  "x-bisibility-name",
  "x-bisibility-union",
  "x-bisibility-legacy-type",
] as const;

/** Type name of an inline schema that a generator emits as its own type. */
export const sdkName = (name: string) => ({ "x-bisibility-name": name });

/** Response enum: a generated value type that keeps values this SDK version does not know. */
export const openEnum = (name: string) => ({
  "x-bisibility-enum": "open",
  "x-bisibility-name": name,
});

/** Request-only enum: a generated exhaustive type; the server rejects any other value. */
export const closedEnum = (name: string) => ({
  "x-bisibility-enum": "closed",
  "x-bisibility-name": name,
});

/** USD cents as a JSON number. Responses may carry fractional cents. */
export const usdCents = { "x-bisibility-money": "usd_cents" } as const;

/** USD as a decimal string, never a float. */
export const usdDecimal = { "x-bisibility-money": "usd_decimal" } as const;

/** USD as a JSON number, decoded as decimal money by SDKs. */
export const usdNumber = { "x-bisibility-money": "usd_number" } as const;

/** Request alternatives accepted by the server; SDKs send the named canonical branch. */
export const shorthandUnion = (canonical: string) => ({
  "x-bisibility-union": { style: "shorthand", canonical },
});

/**
 * A `oneOf`/`anyOf` of different types, decoded by the `const` value of `tag` in each case; at
 * most one case may lack the tag and is the default. Case names follow the composition order.
 */
export const taggedUnion = (tag: string, cases: string[]) => ({
  "x-bisibility-union": { cases, style: "tagged", tag },
});

/** A union of public-ID strings, decoded by their prefix. */
export const publicIdUnion = (cases: string[]) => ({
  "x-bisibility-union": { cases, style: "public_id" },
});

/**
 * A composition that only adds cross-field rules to one object (for example "max_cost_cents is
 * required unless estimate_only is true"). It is validation, not a union type.
 */
export const constraintUnion = { "x-bisibility-union": { style: "constraint" } } as const;

const publicIdPattern = /^\^([a-z]+)_\[a-z\]\[a-z0-9\]\{23\}\$$/;

/** The resource prefix of a strict v3 public-ID pattern, if `pattern` is one. */
export function publicIdPrefix(pattern: unknown) {
  return typeof pattern === "string" ? publicIdPattern.exec(pattern)?.[1] : undefined;
}

/**
 * Copies `value`, adding `x-bisibility-public-id` next to every strict public-ID `pattern`. The
 * prefix is read from the pattern itself, so the two cannot disagree.
 */
export function withPublicIdExtensions<T>(value: T): T {
  if (Array.isArray(value)) return value.map(withPublicIdExtensions) as T;
  if (!value || typeof value !== "object") return value;
  const copy = Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, withPublicIdExtensions(item)]),
  );
  const prefix = publicIdPrefix(copy.pattern);
  const types = Array.isArray(copy.type) ? copy.type : [copy.type];
  if (prefix && types.includes("string")) copy["x-bisibility-public-id"] = prefix;
  return copy as T;
}
