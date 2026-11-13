import type { AiVisibilityTabId } from "@/lib/ai-tracking/ai-visibility-tabs";

export const aiVisibilityLayoutClassName = {
  engines: "flex min-w-0 flex-col gap-5",
  overview: "flex min-w-0 flex-col gap-5",
  prompts: "flex min-w-0 flex-col gap-4",
  research: "flex min-w-0 flex-col gap-5",
  sources: "flex min-w-0 flex-col gap-5",
} as const satisfies Record<AiVisibilityTabId, string>;

export const aiVisibilityBlocks = {
  engines: ["tabs", "lead", "table", "providers"],
  overview: ["tabs", "lead", "stats", "insight", "brands", "spellings", "engines", "trend"],
  prompts: ["tabs", "filters", "table"],
  research: ["tabs", "lead", "lookup", "results"],
  sources: ["tabs", "lead", "tiles", "table", "plan"],
} as const satisfies Record<AiVisibilityTabId, readonly string[]>;

export const aiVisibilityRunsBlocks = ["tabs", "history"] as const;

export const aiVisibilityRunsShell = {
  className: aiVisibilityLayoutClassName.prompts,
  "data-visibility-blocks": aiVisibilityRunsBlocks.join(" "),
  "data-visibility-tab": "prompts",
  "data-visibility-view": "runs",
} as const;
