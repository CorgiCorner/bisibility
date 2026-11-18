import { closedEnum, openEnum, sdkName, taggedUnion } from "./openapi-sdk-schema";

const snake = (key: string) => key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
const pascal = (key: string) =>
  key.replace(/(^|[^a-zA-Z0-9]+)([a-zA-Z0-9])/g, (_, _separator, letter: string) =>
    letter.toUpperCase(),
  );
type Json = Record<string, unknown>;

/** Preserve the contract's strictness and bounds; only property spelling and SDK metadata change. */
export function modelPlaygroundWireSchema(schema: Json, name: string, request = false): Json {
  const {
    $schema: _dialect,
    properties,
    required,
    items,
    anyOf,
    oneOf,
    additionalProperties,
    ...rest
  } = schema;
  const output: Json = { ...rest };
  if (properties && typeof properties === "object") {
    output.properties = Object.fromEntries(
      Object.entries(properties).map(([key, child]) => [
        snake(key),
        modelPlaygroundWireSchema(child as Json, name + pascal(key), request),
      ]),
    );
    if (Array.isArray(required)) output.required = required.map(snake);
    Object.assign(output, sdkName(name));
  }
  if (items && typeof items === "object")
    output.items = modelPlaygroundWireSchema(items as Json, `${name}Item`, request);
  if (additionalProperties !== undefined)
    output.additionalProperties =
      typeof additionalProperties === "object"
        ? modelPlaygroundWireSchema(additionalProperties as Json, `${name}Value`, request)
        : additionalProperties;
  if (Array.isArray(rest.enum)) Object.assign(output, request ? closedEnum(name) : openEnum(name));
  for (const [key, branches] of [
    ["anyOf", anyOf],
    ["oneOf", oneOf],
  ] as const) {
    if (!Array.isArray(branches)) continue;
    const nonNull = branches.filter((branch) => branch.type !== "null");
    output[key] = branches.map((branch, index) =>
      modelPlaygroundWireSchema(branch, `${name}Case${index + 1}`, request),
    );
    if (nonNull.length > 1) {
      const tag = ["kind", "certainty"].find((key) =>
        nonNull.every((branch) => typeof branch.properties?.[key]?.const === "string"),
      );
      if (!tag) throw new Error(`Missing discriminator for ${name}`);
      const cases = nonNull.map((branch) => String(branch.properties[tag].const));
      Object.assign(
        output,
        sdkName(name),
        taggedUnion(
          tag,
          cases.map((value) =>
            value.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase()),
          ),
        ),
      );
    }
  }
  return output;
}
