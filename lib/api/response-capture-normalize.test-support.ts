/**
 * Normalization of captured response bodies.
 *
 * Captures are committed, so generated secrets, public IDs, UUIDs and encrypted references are
 * replaced with zero-filled values of the same length. The replacements keep public-ID, UUID and
 * hash patterns valid, so the conformance verdict does not change.
 */

const publicId = /^([a-z][a-z0-9]*)_[a-z][a-z0-9]{23}$/;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const opaqueReference = /^[A-Za-z0-9+/=:._-]{32,}$/;
const randomRun = /[A-Za-z0-9]{16,}/g;
const maskedRun = /[A-Za-z0-9_-]+(?=\*)|(?<=\*)[A-Za-z0-9_-]+/g;

// Base64 and base64url symbols vary with the random bytes, so they are zeroed too.
const zeros = (text: string) => text.replace(/[A-Za-z0-9+/_-]/g, "0");
const count = (text: string, pattern: RegExp) => text.match(pattern)?.length ?? 0;
const looksRandom = (run: string) => /\d/.test(run) || (/[a-z]/.test(run) && /[A-Z]/.test(run));

export function scrubString(value: string): string {
  const id = publicId.exec(value);
  if (id) return `${id[1]}_a${"0".repeat(23)}`;
  if (uuid.test(value)) return "00000000-0000-4000-8000-000000000000";
  if (opaqueReference.test(value) && count(value, /[A-Z]/g) >= 4 && count(value, /\d/g) >= 2) {
    return zeros(value);
  }
  const unmasked = value.includes("***") ? value.replace(maskedRun, zeros) : value;
  return unmasked.replace(randomRun, (run) => (looksRandom(run) ? zeros(run) : run));
}

export function scrubBody(value: unknown): unknown {
  if (typeof value === "string") return scrubString(value);
  if (Array.isArray(value)) return value.map(scrubBody);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, member]) => [key, scrubBody(member)]),
    );
  }
  return value;
}

/** The JSON structure of a body: object keys and value types, with array members merged. */
export function bodyShape(value: unknown): unknown {
  if (value === null) return "null";
  if (Array.isArray(value)) {
    const members = new Map(
      value.map((member) => {
        const shape = bodyShape(member);
        return [JSON.stringify(shape), shape];
      }),
    );
    return [...members.entries()]
      .sort(([left], [right]) => (left < right ? -1 : 1))
      .map(([, shape]) => shape);
  }
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value as object)
        .sort()
        .map((key) => [key, bodyShape((value as Record<string, unknown>)[key])]),
    );
  }
  if (typeof value === "number") return Number.isInteger(value) ? "integer" : "number";
  return typeof value;
}
