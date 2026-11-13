import { appPath, asProjectRef } from "@/lib/routing/app-path";
import { projectSchedulesPath } from "@/lib/routing/project-schedules-path";
import {
  type AiVisibilityTabId,
  type AiVisibilityTabSlot,
  aiVisibilityTabs,
  resolveAiVisibilityTab,
} from "./ai-visibility-tabs";

export const AI_VISIBILITY_SEGMENT = "ai-visibility";

export type AiVisibilityQuery = Record<string, string | string[] | undefined>;

export function firstQueryValue(value: string | string[] | undefined): string | undefined {
  if (typeof value === "string") return value;
  return value?.[0];
}

export function aiVisibilityTabHref(
  projectRef: string,
  tab: AiVisibilityTabId,
  options?: { keyword?: string; view?: "brand" | "prompts" | "runs" },
): string {
  const params = new URLSearchParams();
  params.set("tab", tab);
  if (tab === "prompts" && options?.view === "runs") params.set("view", "runs");
  if (tab === "research" && options?.view === "brand") params.set("view", "brand");
  if (tab === "research" && options?.keyword) params.set("q", options.keyword);
  return `${appPath(asProjectRef(projectRef), AI_VISIBILITY_SEGMENT)}?${params.toString()}`;
}

export function aiVisibilityPath(projectRef: string): string {
  return appPath(asProjectRef(projectRef), AI_VISIBILITY_SEGMENT);
}

/** Opens an existing tracker drawer from another tab without a second payment flow. */
export function aiVisibilityComposeHref(projectRef: string, compose: "prompt" | "run"): string {
  return `${aiVisibilityTabHref(projectRef, "prompts")}&compose=${compose}`;
}

/** A tab link when that slot has a page, otherwise nothing to link. */
export function aiVisibilityRegisteredHref(
  projectRef: string,
  slot: AiVisibilityTabSlot,
): string | null {
  const tab = aiVisibilityTabs.find((item) => item.id === slot);
  return tab ? aiVisibilityTabHref(projectRef, tab.id) : null;
}

function appendQueryValues(
  params: URLSearchParams,
  key: string,
  value: string | string[] | undefined,
) {
  if (typeof value === "string") params.append(key, value);
  else if (value) for (const item of value) params.append(key, item);
}

function copyQuery(query: AiVisibilityQuery, skip: ReadonlySet<string>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (skip.has(key)) continue;
    appendQueryValues(params, key, value);
  }
  return params;
}

/** `prompt-tracker` -> the Prompts tab, keeping the inner runs view and the schedules redirect. */
export function promptTrackerRedirectPath(
  projectRef: string,
  query: AiVisibilityQuery = {},
): string {
  const tab = firstQueryValue(query.tab);
  if (tab === "schedules") {
    const schedule = firstQueryValue(query.schedule);
    const path = projectSchedulesPath(asProjectRef(projectRef));
    return schedule ? `${path}?ai=${encodeURIComponent(schedule)}` : path;
  }
  const params = new URLSearchParams();
  params.set("tab", "prompts");
  if (tab === "runs" || firstQueryValue(query.view) === "runs") params.set("view", "runs");
  const rest = copyQuery(query, new Set(["tab", "view"]));
  for (const [key, value] of rest) params.append(key, value);
  return `${aiVisibilityPath(projectRef)}?${params.toString()}`;
}

/** `prompt-research` -> the Research tab, keeping `q` and every other parameter. */
export function promptResearchRedirectPath(
  projectRef: string,
  query: AiVisibilityQuery = {},
): string {
  const params = new URLSearchParams();
  params.set("tab", resolveAiVisibilityTab("research"));
  const rest = copyQuery(query, new Set(["tab"]));
  for (const [key, value] of rest) params.append(key, value);
  return `${aiVisibilityPath(projectRef)}?${params.toString()}`;
}

/** `brand-visibility` -> the Research tab, keeping the query. */
export const brandVisibilityRedirectPath = promptResearchRedirectPath;
