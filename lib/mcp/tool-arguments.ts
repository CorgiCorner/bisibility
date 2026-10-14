import type { JsonObject } from "./types";

type ToolArgs = JsonObject;

export function requiredString(input: ToolArgs, key: string) {
  const value = input[key];
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${key} is required.`);
  }
  return value;
}

function serializeQueryValue(value: unknown) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value === "object") return JSON.stringify(value);
  if (typeof value === "function") return value.name;
  if (typeof value === "symbol") return value.description ?? "";
  if (typeof value === "string") return value;
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return value.toString(10);
  if (typeof value === "bigint") return value.toString(10);
  return "";
}

export function query(input: ToolArgs, keys: string[]) {
  const params = new URLSearchParams();
  for (const key of keys) {
    const serialized = serializeQueryValue(input[key]);
    if (serialized !== null) params.set(key, serialized);
  }
  return params.size ? `?${params}` : "";
}

export function body(input: ToolArgs, omit: string[]) {
  const skipped = new Set([...omit, "idempotency_key", "project_id"]);
  return Object.fromEntries(Object.entries(input).filter(([key]) => !skipped.has(key)));
}

export function addKeywordsBody(input: ToolArgs) {
  const defaults = body(input, ["project_id", "keywords"]);
  const keywords = Array.isArray(input.keywords) ? input.keywords : [];

  return {
    keywords: keywords.map((item) =>
      typeof item === "string"
        ? { ...defaults, keyword: item }
        : { ...defaults, ...(item as JsonObject) },
    ),
  };
}
