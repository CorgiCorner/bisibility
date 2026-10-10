const opaque = new Set(["parameters", "raw", "requested_parameters", "requestedParameters"]);
function convert(value: unknown, keyMapper: (key: string) => string): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map((item) => convert(item, keyMapper));
  if (!value || typeof value !== "object" || Object.getPrototypeOf(value) !== Object.prototype)
    return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      keyMapper(key),
      opaque.has(key) ? item : convert(item, keyMapper),
    ]),
  );
}
export function trackingCamelizeKeys(value: unknown) {
  return convert(value, (key) =>
    key.replace(/_([a-z0-9])/g, (_, letter: string) => letter.toUpperCase()),
  );
}
export function trackingSnakeizeKeys(value: unknown) {
  return convert(value, (key) => key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`));
}
