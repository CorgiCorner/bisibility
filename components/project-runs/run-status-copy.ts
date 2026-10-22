import type { StatusChipTone } from "@/components/ui/StatusChip";
import { rankRunStatusKeyChipPresentation } from "@/components/ui/status-chip-mapping";
import { AI_RUN_STATUS_KEYS, type AiRunStatusKey, aiRunState } from "@/lib/runs/ai-run-state";
import type { ProjectRunsSource } from "@/lib/runs/filters";
import {
  GSC_RUN_STATUS_KEYS,
  type GscRunStatusKey,
  gscRunStatusKey,
  RANK_RUN_STATUS_KEYS,
  type RankRunStatusKey,
  rankRunStatusKey,
} from "@/lib/runs/run-status-vocabulary";
import { useTranslations } from "next-intl";
import { useMemo } from "react";
import type { ProjectRunWithOperationSnapshot } from "./project-runs-presentation";

export type RunStatusCopy = Readonly<{ description: string; label: string; tone: StatusChipTone }>;
export type RunStatusSource = Exclude<ProjectRunsSource, "all">;
export type RunStatusCopyGroup = Readonly<{
  entries: readonly (RunStatusCopy & Readonly<{ key: string }>)[];
  source: RunStatusSource;
}>;

const GSC_STATUS_TONES = {
  queued: "info",
  importing: "info",
  paused: "attention",
  waiting_for_google: "attention",
  reconnect_required: "critical",
  waiting_for_data: "info",
  delayed: "attention",
  failed: "critical",
  completed: "positive",
  status_unavailable: "neutral",
} as const satisfies Record<GscRunStatusKey, StatusChipTone>;

/** Chips, the status filter and the legend read their words from here, so they never differ. */
export function useRunStatusCopy() {
  const statusT = useTranslations("shared.controls.status");
  const t = useTranslations("shared.runStatuses");
  const aiT = useTranslations("projectRuns.aiStatuses");
  return useMemo(() => {
    const rank = (key: RankRunStatusKey): RunStatusCopy => {
      const presentation = rankRunStatusKeyChipPresentation(key);
      return {
        description: t(`rank.${key}.description`),
        label: statusT(presentation.messageKey),
        tone: presentation.tone,
      };
    };
    const searchConsole = (key: GscRunStatusKey): RunStatusCopy => ({
      description: t(`searchConsole.${key}.description`),
      label: t(`searchConsole.${key}.label`),
      tone: GSC_STATUS_TONES[key],
    });
    const ai = (key: AiRunStatusKey): RunStatusCopy => ({
      label: aiT(`${key}.label`),
      description: aiT(`${key}.description`),
      tone: ["failed", "cost_limit_exceeded"].includes(key)
        ? "critical"
        : ["blocked", "partial", "skipped"].includes(key)
          ? "attention"
          : key === "completed"
            ? "positive"
            : key === "running"
              ? "info"
              : "neutral",
    });
    const groups: readonly RunStatusCopyGroup[] = [
      {
        entries: RANK_RUN_STATUS_KEYS.map((key) => ({ ...rank(key), key })),
        source: "rank_checks",
      },
      { entries: AI_RUN_STATUS_KEYS.map((key) => ({ ...ai(key), key })), source: "ai_tracking" },
      {
        entries: GSC_RUN_STATUS_KEYS.map((key) => ({ ...searchConsole(key), key })),
        source: "search_console",
      },
    ];
    const forRun = (run: ProjectRunWithOperationSnapshot) =>
      run.kind === "ai"
        ? ai(aiRunState(run.details.state, run.timestamps.finishedAt, run.details.reason).key)
        : run.kind === "rank"
          ? rank(
              rankRunStatusKey(run.details.status, run.details.outcome, run.details.blockedReason),
            )
          : searchConsole(gscRunStatusKey(run));
    return { forRun, groups, rank, searchConsole };
  }, [statusT, t, aiT]);
}

export type RunStatusCopyApi = ReturnType<typeof useRunStatusCopy>;
