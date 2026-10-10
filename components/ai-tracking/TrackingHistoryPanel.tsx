"use client";
import { Button } from "@/components/ui/Button";
import type {
  TrackingSampleRow,
  TrackingWorkspaceData,
} from "@/lib/ai-tracking/projections/workspace";
import type { TrackingWorkspaceActions } from "@/lib/ai-tracking/projections/workspace-actions";
import { useTranslations } from "next-intl";
import { TrackingCitations } from "./TrackingCitations";
import { TrackingRunHistory } from "./TrackingRunHistory";
import { TrackingTrends } from "./TrackingTrends";
import { useTrackingHistory } from "./useTrackingHistory";

export function TrackingHistoryPanel({
  data,
  actions,
  initialSamples,
  onSelectSample,
  onCancel,
}: Readonly<{
  data: TrackingWorkspaceData;
  actions: TrackingWorkspaceActions;
  initialSamples: TrackingSampleRow[];
  onSelectSample: (sample: TrackingSampleRow) => void;
  onCancel: (id: string) => void;
}>) {
  const t = useTranslations("projectAiTracking");
  const state = useTrackingHistory(data.runs, data.runsNextCursor ?? null, initialSamples, actions);
  return (
    <section className="space-y-4" aria-busy={state.pending}>
      <TrackingTrends runs={state.runs} onCompare={actions.compare} onExport={actions.export} />
      {state.error && (
        <p role="alert" className="text-sm text-red-text">
          {state.error}
        </p>
      )}
      <TrackingRunHistory
        runs={state.runs}
        samples={state.samples}
        canWrite={data.canWrite}
        onSelectRun={state.selectRun}
        onSelectSample={onSelectSample}
        onCancel={onCancel}
      />
      {state.runCursor && (
        <Button variant="secondary" size="sm" loading={state.pending} onClick={state.loadRuns}>
          {t("loadMoreRuns")}
        </Button>
      )}
      {state.selectedRunId && (
        <>
          <p className="text-xs text-fg-muted" role="status">
            {t("evidenceLoaded", { loaded: state.samples.length, expected: state.expected })}
          </p>
          {state.sampleCursor && (
            <Button
              variant="secondary"
              size="sm"
              loading={state.pending}
              onClick={state.loadSamples}
            >
              {t("loadMoreSamples")}
            </Button>
          )}
          <TrackingCitations
            runId={state.selectedRunId}
            samples={state.samples}
            expected={state.expected}
            hasMore={Boolean(state.sampleCursor) || state.samples.length < state.expected}
            onSelectSample={onSelectSample}
          />
        </>
      )}
    </section>
  );
}
