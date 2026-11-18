// Frozen verbatim from 827d7de374:lib/providers/model/transport-io.ts (export renamed).
export function baseModelJson(text: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(text);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
  const pending = [{ value: parsed, depth: 0 }];
  let nodes = 0;
  while (pending.length) {
    const item = pending.pop();
    if (!item || item.depth > 64 || ++nodes > 20_000) throw new Error();
    for (const [key, value] of Object.entries(item.value)) {
      if (["__proto__", "prototype", "constructor"].includes(key)) throw new Error();
      if (value && typeof value === "object") pending.push({ value, depth: item.depth + 1 });
    }
  }
  return parsed as Record<string, unknown>;
}
