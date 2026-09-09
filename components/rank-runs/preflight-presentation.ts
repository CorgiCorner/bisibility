import type { StatusChipTone } from "@/components/ui/StatusChip";
import type { RankCheckRunPreview } from "@/lib/rank-check/runs/preview";

export type PreflightScope = {
  description: string;
  equation: string;
  startLabel: string;
  subtitle: string;
  title: string;
};

export type PreflightProvider = {
  id: string;
  label: string;
  note?: string;
  tooltip: string;
};

export type PreflightBlockCode = NonNullable<RankCheckRunPreview["budget"]["reason"]>;

type PreflightBlockPresentation = {
  cta: string;
  label: string;
  message: (preview: RankCheckRunPreview, duplicateDetail?: string) => string;
  tone: StatusChipTone;
};

export const preflightBlockPresentation = {
  budget_exhausted: {
    cta: "Edit budget",
    label: "Budget",
    message: (_preview) => "This run is paused because the budget was reached.",
    tone: "attention",
  },
  duplicate: {
    cta: "Open run",
    label: "Run in progress",
    message: (_preview, duplicateDetail) =>
      duplicateDetail ??
      "A run over this scope is already running. Starting now would pay twice for the same positions.",
    tone: "attention",
  },
  no_provider: {
    cta: "Open Integrations",
    label: "No provider",
    message: () =>
      "No provider connected, so there is nowhere to send these targets. Your own key, billed to you directly.",
    tone: "critical",
  },
} as const satisfies Record<PreflightBlockCode, PreflightBlockPresentation>;

export function blockCodeFor(preview: RankCheckRunPreview, actionBlock: PreflightBlockCode | null) {
  return actionBlock ?? (preview.budget.blocked ? preview.budget.reason : null);
}

export function decisionLine(preview: RankCheckRunPreview, leftAfterLabel?: string) {
  if (preview.budget.reason === "budget_exhausted") {
    return preflightBlockPresentation.budget_exhausted.message(preview);
  }
  const duration =
    preview.targetCount <= 30 ? "~40s" : preview.targetCount <= 400 ? "~6 min" : "~9 min";
  return leftAfterLabel ?? duration;
}
