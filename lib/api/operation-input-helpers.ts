import type { z } from "zod";

/**
 * How a handler reads one request location (the JSON body or the query string).
 *
 * - `zod`: the input is parsed with this schema. `keys: "camel"` (the default) means the wire
 *   input is camelized first, as `parseApiInput` does, so wire `connection_id` reaches the schema
 *   as `connectionId`. `keys: "wire"` means the schema sees the wire names unchanged. `aliases`
 *   maps a wire name (dotted for nested ones) to its local schema key when the handler renames it.
 *   `serverKeys` are schema keys (dotted for nested ones) that the server fills in from the path,
 *   headers or the caller's identity; they are not wire input. `alsoReads` are wire names the
 *   handler reads by hand next to the schema. `handlerDefaults` are wire names the handler always
 *   supplies while building the input (`get("limit") ?? 100`), so the schema may require them
 *   although the wire input does not.
 * - `raw`: the handler reads these wire names by hand (`parseLimit`, `searchParams.get`, ...)
 *   without a zod schema. Raw reads are moved to zod as their operations are touched.
 */
export type ZodInputOptions = {
  aliases?: Readonly<Record<string, string>>;
  alsoReads?: readonly string[];
  handlerDefaults?: readonly string[];
  keys?: "camel" | "wire";
  serverKeys?: readonly string[];
};

export type InputSource =
  | ({ kind: "zod"; schema: z.ZodType } & ZodInputOptions)
  | { fields: readonly string[]; kind: "raw" };

/** The input an operation's handler validates. An absent location is never read. */
export type OperationInput = { body?: InputSource; query?: InputSource };

export const noInput: OperationInput = {};

export function zodInput(schema: z.ZodType, options: ZodInputOptions = {}): InputSource {
  return { kind: "zod", schema, ...options };
}

export function rawInput(...fields: string[]): InputSource {
  return { fields, kind: "raw" };
}
