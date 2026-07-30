export function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function firstString(...values: unknown[]) {
  for (const value of values) {
    const string = stringValue(value);
    if (string) return string;
  }
  return undefined;
}

export function pathList(value: unknown, limit: number) {
  if (!Array.isArray(value)) return undefined;
  const paths = value
    .flatMap((item) => {
      const path = stringValue(item);
      return path ? [path] : [];
    })
    .slice(0, limit);
  return paths.length ? paths : undefined;
}

export function httpsUrl(value: unknown) {
  const url = stringValue(value);
  if (!url) return undefined;
  if (/^https?:\/\//i.test(url)) return url;
  if (!/[\s/:]/.test(url) && url.split(".").length > 1 && url.split(".").every(Boolean)) {
    return `https://${url}`;
  }
  return url;
}
