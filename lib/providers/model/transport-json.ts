import { z } from "zod";
import { ModelTransportError } from "./errors";

export const MODEL_JSON_LIMITS = Object.freeze({
  numericLiteralCharacters: 256,
  decimalCharacters: 2048,
});
const segment = z.union([
  z
    .string()
    .min(1)
    .max(128)
    .refine((value) => !["__proto__", "prototype", "constructor"].includes(value)),
  z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
]);
export const modelJsonOptionsSchema = z
  .object({ moneyPaths: z.array(z.array(segment).min(1).max(64)).max(32) })
  .strict();
export type ModelJsonOptions = { moneyPaths: readonly (readonly (string | number)[])[] };

function decimal(source: string) {
  const match = /^(-?)(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/.exec(source);
  if (!match) throw new Error();
  const [, sign, integer, fraction = "", exponent = "0"] = match;
  const digits = integer + fraction;
  const point = integer.length + Number(exponent);
  if (Math.abs(point) + digits.length > MODEL_JSON_LIMITS.decimalCharacters) throw new Error();
  const expanded =
    point <= 0
      ? `0.${"0".repeat(-point)}${digits}`
      : point >= digits.length
        ? digits + "0".repeat(point - digits.length)
        : `${digits.slice(0, point)}.${digits.slice(point)}`;
  const normalized = expanded.replace(/^0+(?=\d)/, "");
  return (/^0(?:\.0+)?$/.test(normalized) ? "" : sign) + normalized;
}

/** Reviver source is the original JSON token, never a string reconstructed from a double. */
export function parseModelJson(text: string, options?: ModelJsonOptions): Record<string, unknown> {
  try {
    const paths = options === undefined ? [] : modelJsonOptionsSchema.parse(options).moneyPaths;
    const literals = new WeakMap<object, Map<string, string>>();
    const parsed: unknown = paths.length
      ? JSON.parse(
          text,
          function (this: object, key: string, value: unknown, context?: { source?: string }) {
            if (typeof value === "number" && context?.source) {
              let fields = literals.get(this);
              if (!fields) {
                fields = new Map();
                literals.set(this, fields);
              }
              fields.set(key, context.source);
            }
            return value;
          },
        )
      : JSON.parse(text);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
    const pending = [{ value: parsed, depth: 0, path: [] as string[] }];
    let nodes = 0;
    while (pending.length) {
      const item = pending.pop();
      if (!item || item.depth > 64 || ++nodes > 20_000) throw new Error();
      for (const [key, value] of Object.entries(item.value)) {
        if (["__proto__", "prototype", "constructor"].includes(key)) throw new Error();
        const path = [...item.path, key];
        if (
          typeof value === "number" &&
          paths.some(
            (candidate) =>
              candidate.length === path.length &&
              candidate.every((part, index) => String(part) === path[index]),
          )
        ) {
          const source = literals.get(item.value)?.get(key);
          // Only selected money requires source text and bounded finite literals.
          if (!source) throw new ModelTransportError("invalid_response");
          if (source.length > MODEL_JSON_LIMITS.numericLiteralCharacters || !Number.isFinite(value))
            throw new Error();
          const exponent = /[eE]([+-]?\d+)$/.exec(source)?.[1];
          if (exponent && Math.abs(Number(exponent)) > MODEL_JSON_LIMITS.decimalCharacters)
            throw new Error();
          Object.defineProperty(item.value, key, {
            value: decimal(source),
            writable: true,
            enumerable: true,
            configurable: true,
          });
        } else if (value && typeof value === "object")
          pending.push({ value, depth: item.depth + 1, path });
      }
    }
    return parsed as Record<string, unknown>;
  } catch {
    throw new ModelTransportError("invalid_response");
  }
}
