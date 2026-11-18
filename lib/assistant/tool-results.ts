const secret =
  /token|secret|password|authorization|(?:^|_)key(?:$|_)|(?:api|private|access|secret|client)key/i;
function clean(value: unknown, depth: number): unknown {
  if (depth > 6) return "[truncated]";
  if (typeof value === "string")
    return /<\/?[a-z][^>]*>/i.test(value) ? "[HTML omitted]" : value.slice(0, 1500);
  if (Array.isArray(value)) return value.slice(0, 30).map((item) => clean(item, depth + 1));
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !secret.test(key))
        .slice(0, 50)
        .map(([key, item]) => [key, clean(item, depth + 1)]),
    );
  return value;
}
export function safeAssistantToolResult(value: unknown): unknown {
  const sanitized = clean(value, 0);
  const encoded = JSON.stringify(sanitized);
  return encoded && encoded.length <= 8000
    ? sanitized
    : { summary: "Result was too large to include." };
}
