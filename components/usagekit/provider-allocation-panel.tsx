"use client";
import { Button } from "@/components/usagekit/primitives/button";
import {
  ProviderAllocationEditor,
  providerAllocationLabels,
} from "@/components/usagekit/provider-allocation-form";
import type { AllocationProps } from "@/components/usagekit/provider-allocation-policy";
import type { ProviderAllocationLabels } from "@/components/usagekit/provider-allocation-row";
import type { ProviderFeedbackLabels } from "@/components/usagekit/provider-feedback";
import { ProviderReadFeedback } from "@/components/usagekit/provider-feedback";
import { UsageSpinner } from "@/components/usagekit/usage-motion";
import { useProviderEditor } from "@usagekit/react";
import type { ProviderAllocationRow } from "@usagekit/views";
import { useRef, useState } from "react";
export function ProviderAllocationPanel({
  connectionIds,
  fresh = false,
  labels,
  feedbackLabels,
  onReload,
  evidenceAvailable = true,
  canEdit = true,
  rowFilter,
  onRefreshPendingChange,
  ...presentation
}: {
  connectionIds: readonly string[];
  /** Runs first on every explicit reload to reverify host access. */
  onReload?: () => void;
  fresh?: boolean;
  labels?: Partial<ProviderAllocationLabels>;
  feedbackLabels?: Partial<ProviderFeedbackLabels>;
  /** A composing panel may withdraw evidence without discarding this editor's draft. */
  evidenceAvailable?: boolean;
  canEdit?: boolean;
  rowFilter?: (row: ProviderAllocationRow) => boolean;
} & Omit<
  AllocationProps,
  "rows" | "evidenceRows" | "action" | "revision" | "fresh" | "labels" | "feedbackLabels"
>) {
  const [refreshing, setRefreshing] = useState(false);
  const pendingEditors = useRef(0);
  const notify = useRef(onRefreshPendingChange);
  notify.current = onRefreshPendingChange;
  const result = useProviderEditor({ kind: "allocations", connectionIds });
  const action = {
    ...result.action,
    canWrite: result.canEdit && canEdit && evidenceAvailable,
  };
  const reloadDisabled =
    refreshing || action.pending || action.ambiguous || result.refreshing || !evidenceAvailable;
  const reload = () => {
    onReload?.();
    result.reload();
  };
  const repeated = action.state === "forbidden" && result.state === "forbidden";
  if (!result.editorData)
    return (
      <ProviderReadFeedback
        message={presentation.feedbackMessage}
        formatMessage={presentation.formatFeedback}
        state={result.state}
        error={result.error}
        refresh={reload}
        disabled={reloadDisabled}
        {...(feedbackLabels ? { labels: feedbackLabels } : {})}
      />
    );
  return (
    <div className="space-y-3">
      <Button type="button" variant="outline" size="sm" disabled={reloadDisabled} onClick={reload}>
        {result.refreshing && <UsageSpinner />}
        {labels?.reload ?? providerAllocationLabels.reload}
      </Button>
      {!result.evidence && !repeated && (
        <ProviderReadFeedback
          message={presentation.feedbackMessage}
          formatMessage={presentation.formatFeedback}
          state={result.state}
          error={result.error}
          refresh={reload}
          disabled={reloadDisabled}
          {...(feedbackLabels ? { labels: feedbackLabels } : {})}
        />
      )}
      <ProviderAllocationEditor
        {...presentation}
        key={result.editorEpoch}
        onRefreshPendingChange={(pending) => {
          pendingEditors.current += pending ? 1 : -1;
          if (pendingEditors.current === (pending ? 1 : 0)) {
            setRefreshing(pending);
            notify.current?.(pending);
          }
        }}
        rows={rowFilter ? result.editorData.rows.filter(rowFilter) : result.editorData.rows}
        revision={result.editorData.revision}
        evidenceRows={
          evidenceAvailable
            ? (result.evidence?.rows.filter((row) => !rowFilter || rowFilter(row)) ?? null)
            : null
        }
        action={action}
        fresh={fresh}
        {...(labels ? { labels } : {})}
        {...(feedbackLabels ? { feedbackLabels } : {})}
      />
    </div>
  );
}
