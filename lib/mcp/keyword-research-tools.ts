import type { JsonObject } from "./types";

type ResearchToolCall = {
  body?: unknown;
  method: "GET" | "POST";
  path: string;
  projectId?: string;
};

function projectId(input: JsonObject) {
  const value = input.project_id;
  if (typeof value !== "string" || !value.trim()) throw new Error("project_id is required.");
  return value;
}

function query(input: JsonObject) {
  const params = new URLSearchParams();
  for (const key of [
    "seed",
    "mode",
    "result_limit",
    "connection_id",
    "include_clickstream",
    "fresh",
    "estimate_only",
    "max_cost_cents",
  ]) {
    const value = input[key];
    if (value !== undefined && value !== null && value !== "") params.set(key, String(value));
  }
  return params.size ? `?${params}` : "";
}

export function dispatchKeywordResearchTool(
  name: string,
  input: JsonObject,
): ResearchToolCall | null {
  if (name !== "research_keywords" && name !== "get_keyword_metrics") return null;
  const id = projectId(input);
  const base = `/projects/${encodeURIComponent(id)}`;
  if (name === "research_keywords") {
    return {
      method: "GET",
      path: `${base}/keyword-research${query(input)}`,
      projectId: id,
    };
  }
  if (name === "get_keyword_metrics") {
    return {
      body: Object.fromEntries(Object.entries(input).filter(([key]) => key !== "project_id")),
      method: "POST",
      path: `${base}/keyword-metrics`,
      projectId: id,
    };
  }
  return null;
}
