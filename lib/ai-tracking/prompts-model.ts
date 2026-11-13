import { type AiVisibilityQuery, firstQueryValue } from "@/lib/ai-tracking/ai-visibility-paths";
import type { TrackingSource } from "@/lib/ai-tracking/contract";
import {
  type OverviewAnswerInput,
  type OverviewEntityInput,
  type OverviewFilters,
  type OverviewMarketOption,
  overviewFiltersFromQuery,
  overviewSearchParams,
} from "@/lib/ai-tracking/overview-model";
import { isPublicIdOfType } from "@/lib/db/public-id-resources";

export type PromptCitation = {
  position: number;
  title: string | null;
  url: string;
};

export type PromptAnswerRecord = Omit<OverviewAnswerInput, "citations"> & {
  citations: readonly PromptCitation[];
  costState: string;
  costUsd: string | null;
  promptId: string;
  promptRevisionId: string;
  sampleId: string;
  source: TrackingSource;
};

export type PromptProjectionPrompt = {
  configuredEngines: readonly string[];
  id: string;
  provenance: "manual" | "model_generated_hypothesis" | "provider_dataset";
  revision: number;
  status: "active" | "paused" | "archived";
  text: string;
  topicId: string | null;
  topicName: string | null;
};

export type PromptOutcomeRow = {
  cited: number;
  engines: readonly string[];
  id: string;
  lastRunAt: string | null;
  leader: { label: string; own: boolean } | null;
  named: number;
  status: PromptProjectionPrompt["status"];
  text: string;
  topicId: string | null;
  topicName: string | null;
  total: number;
  type: "branded" | "unbranded";
};

export type PromptPanelAnswer = {
  citations: PromptAnswerRecord["citations"];
  costState: string;
  costUsd: string | null;
  engine: string;
  finishedAt: string | null;
  id: string;
  promptRevisionId: string;
  provider: string | null;
  source: TrackingSource;
  text: string;
};

export type PromptPanel = {
  answers: readonly PromptPanelAnswer[];
  provenance: PromptProjectionPrompt["provenance"];
  promptId: string;
  revision: number;
  status: PromptProjectionPrompt["status"];
  text: string;
};

export type PromptSectionRow = {
  count: number;
  id: string;
  kind: "section";
  label: string;
  topicName: string | null;
};

export type PromptDataRow = PromptOutcomeRow & { kind: "row"; label: string };

export type PromptTableRow = PromptDataRow | PromptSectionRow;

export type AiVisibilityPromptsModel = {
  engines: readonly string[];
  entities: readonly OverviewEntityInput[];
  filters: OverviewFilters;
  markets: readonly OverviewMarketOption[];
  /** Server clock for relative times, so the client renders the same labels. */
  now: string;
  panel: PromptPanel | null;
  rows: readonly PromptOutcomeRow[];
  truncated: boolean;
};

const FILTER_KEYS = ["engine", "market", "prompts", "range", "tab", "topic"] as const;

export function promptsSelectedId(value: string | null | undefined): string | null {
  return value && isPublicIdOfType(value, "aip") ? value : null;
}

export function promptsCompose(value: string | null | undefined): "prompt" | "run" | null {
  return value === "prompt" || value === "run" ? value : null;
}

export function promptsStateFromQuery(query: AiVisibilityQuery) {
  return {
    compose: promptsCompose(firstQueryValue(query.compose)),
    filters: overviewFiltersFromQuery(query),
    promptId: promptsSelectedId(firstQueryValue(query.prompt)),
    view: firstQueryValue(query.view) === "runs" ? ("runs" as const) : ("prompts" as const),
  };
}

export function promptsSearchParams(filters: OverviewFilters) {
  const params = overviewSearchParams(filters);
  params.set("tab", "prompts");
  return params;
}

export function replacePromptsQuery(
  pathname: string,
  current: URLSearchParams,
  change: {
    compose?: "prompt" | "run" | null;
    filters?: OverviewFilters;
    prompt?: string | null;
    view?: "prompts" | "runs";
  },
) {
  const params = new URLSearchParams(current);
  if (change.filters) {
    for (const key of FILTER_KEYS) params.delete(key);
    for (const [key, value] of promptsSearchParams(change.filters)) params.set(key, value);
  } else {
    params.set("tab", "prompts");
  }
  if (change.view) {
    if (change.view === "runs") params.set("view", "runs");
    else params.delete("view");
  }
  if ("prompt" in change) {
    if (change.prompt) params.set("prompt", change.prompt);
    else params.delete("prompt");
  }
  if ("compose" in change) {
    if (change.compose) params.set("compose", change.compose);
    else params.delete("compose");
  }
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}
