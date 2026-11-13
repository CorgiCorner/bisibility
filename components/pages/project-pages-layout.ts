import type { ProjectPagesTabId } from "@/lib/pages/tabs";

export const projectPagesLayoutClassName =
  "flex min-w-0 max-w-full flex-col gap-3 overflow-x-hidden";

export const projectPagesBlocks = {
  all: ["tabs", "toolbar", "sources", "table"],
  "by-tag": ["tabs", "lead", "table"],
  compare: ["tabs", "filters", "chart"],
  "existing-vs-new": ["tabs", "controls", "chart"],
} as const satisfies Record<ProjectPagesTabId, readonly string[]>;
