export function boundedJson(value: unknown, maxBytes: number): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const pending: Array<{ value: unknown; depth: number }> = [{ value, depth: 0 }];
  let nodes = 0;
  const seen = new Set<object>();
  while (pending.length) {
    const item = pending.pop();
    if (!item || ++nodes > 20000 || item.depth > 16) return false;
    const current = item.value;
    if (current === null || typeof current === "string" || typeof current === "boolean") continue;
    if (typeof current === "number") {
      if (!Number.isFinite(current)) return false;
      continue;
    }
    if (typeof current !== "object" || seen.has(current)) return false;
    seen.add(current);
    if (!Array.isArray(current) && Object.getPrototypeOf(current) !== Object.prototype)
      return false;
    for (const child of Object.values(current))
      pending.push({ value: child, depth: item.depth + 1 });
  }
  return new TextEncoder().encode(JSON.stringify(value)).byteLength <= maxBytes;
}
