"use client";
import type { AllocationProps } from "@/components/usagekit/provider-allocation-policy";

export type { AllocationProps } from "@/components/usagekit/provider-allocation-policy";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/usagekit/primitives/card";
import { useAllocationRefresh } from "@/components/usagekit/provider-allocation-observation";
import {
  AllocationFormSurface,
  allocationDisplay,
  allocationDraftValue,
  allocationEditorIdentity,
  allocationInput,
} from "@/components/usagekit/provider-allocation-policy";
import type { Draft } from "@/components/usagekit/provider-allocation-row";
import {
  AllocationRow,
  providerAllocationLabels,
} from "@/components/usagekit/provider-allocation-row";
import {
  ProviderActionFeedback,
  providerFeedbackLabels,
} from "@/components/usagekit/provider-feedback";
import { UsageNotice } from "@/components/usagekit/usage-motion";
import { useProviderAction } from "@usagekit/react";
import type { ProviderAllocationRow, ProviderReconciliation } from "@usagekit/views";
import { useId, useRef, useState } from "react";
import { AllocationSaveAction } from "./AllocationSaveAction";

export { providerAllocationLabels } from "@/components/usagekit/provider-allocation-row";
export function ProviderAllocationEditor(props: AllocationProps) {
  const { refreshing, beginRefresh } = useAllocationRefresh(props.onRefreshPendingChange);
  const identity = allocationEditorIdentity(props);
  return (
    <AllocationEditor
      key={identity}
      {...props}
      refreshing={refreshing}
      beginRefresh={beginRefresh}
    />
  );
}
function AllocationEditor({
  rows,
  evidenceRows = rows,
  action: guardedAction,
  revision,
  fresh = false,
  projections,
  labels: custom,
  feedbackLabels,
  inputPolicy,
  formatValidation,
  formatFigure,
  formatUnit,
  formatTime,
  suggestionEligible,
  onRefreshBalance,
  renderEvidence,
  evidenceBefore,
  evidenceAfter,
  help,
  variant = "card",
  onSaved,
  formAdapter,
  actionsContainer,
  rowLabels,
  canRefreshBalance,
  onRefreshNative,
  renderNativeObservation,
  emptyState,
  feedbackMessage,
  formatFeedback,
  refreshing,
  beginRefresh,
}: AllocationProps & { refreshing: boolean; beginRefresh: () => () => void }) {
  const formId = useId();
  const labels = { ...providerAllocationLabels, ...custom };
  const feedback = { ...providerFeedbackLabels, ...feedbackLabels };
  const sharedAction = useProviderAction();
  const action = guardedAction ?? sharedAction;
  const policy = (row: ProviderAllocationRow) =>
    typeof inputPolicy === "function" ? inputPolicy(row) : inputPolicy;
  const initial = Object.fromEntries(
    rows.map((row) => [
      row.id,
      {
        limit: allocationDraftValue(row, policy(row)),
        unlimited: row.unlimited,
      },
    ]),
  );
  const [drafts, setDrafts] = useState<Record<string, Draft>>(initial);
  const [error, setError] = useState<string | null>(null);
  const ownCommand = useRef<string | null>(
    (action.pending || action.ambiguous) &&
      action.submittedCommand?.kind === "allocations" &&
      action.submittedCommand.expectedRevision === revision
      ? action.submittedCommand.commandId
      : null,
  );
  const completed = useRef<string | null>(null);
  const finish = (answer: ProviderReconciliation) => {
    if (
      answer.outcome === "success" &&
      answer.commandId === ownCommand.current &&
      completed.current !== answer.commandId
    ) {
      completed.current = answer.commandId;
      onSaved?.(answer);
    }
  };
  const feedbackAction = {
    ...action,
    reconcile: async () => {
      const answer = await action.reconcile();
      finish(answer);
      return answer;
    },
  };
  const editable =
    action.canWrite &&
    !refreshing &&
    !action.pending &&
    !action.ambiguous &&
    action.state !== "conflict";
  const current = (row: ProviderAllocationRow) =>
    evidenceRows?.find(
      (value) =>
        value.id === row.id &&
        value.connectionId === row.connectionId &&
        value.fundingSource === row.fundingSource &&
        value.surface === row.surface &&
        value.unit === row.unit,
    ) ?? null;
  const known = (row: ProviderAllocationRow) =>
    row.unlimited || (row.limit !== "unavailable" && row.limit.certainty !== "unknown");
  const mayEdit = (row: ProviderAllocationRow) =>
    editable &&
    row.editable &&
    current(row)?.editable === true &&
    (policy(row)?.blank !== "unlimited" || (known(row) && known(current(row)!)));
  const fields = Object.fromEntries(rows.map((row) => [row.id, formAdapter?.field(row)]));
  const submitted = action.submittedCommand;
  const shown = (row: ProviderAllocationRow): Draft => {
    const pending =
      (action.pending || action.ambiguous) && submitted?.kind === "allocations"
        ? submitted.changes.find((change) => change.rowId === row.id)
        : null;
    return pending && pending.limit !== undefined
      ? {
          unlimited: pending.limit === null,
          limit: pending.limit === null ? "" : allocationDisplay(pending.limit, row, policy(row)),
        }
      : fields[row.id]
        ? {
            limit: fields[row.id]!.value,
            unlimited:
              policy(row)?.blank === "unlimited"
                ? fields[row.id]!.value.trim() === ""
                : drafts[row.id]!.unlimited,
          }
        : (drafts[row.id] ?? initial[row.id]!);
  };
  const changedRows = rows.filter(
    (row) =>
      shown(row).unlimited !== initial[row.id]!.unlimited ||
      (!shown(row).unlimited && shown(row).limit !== initial[row.id]!.limit),
  );
  const invalidated = changedRows.some(
    (row) =>
      !row.editable ||
      current(row)?.editable !== true ||
      (policy(row)?.blank === "unlimited" && (!known(row) || !known(current(row)!))),
  );
  const message = editable && invalidated ? feedback.conflict : error;
  const save = async () => {
    if (!editable || invalidated) return;
    const changes = changedRows.map((row) => ({
      rowId: row.id,
      expectedRevision: row.revision,
      limit: shown(row).unlimited ? null : shown(row).limit,
    }));
    for (const change of changes) {
      if (change.limit !== null) {
        const row = rows.find((row) => row.id === change.rowId)!;
        const result = allocationInput(change.limit, row, policy(row));
        if ("issue" in result) {
          setError(`${row.label}: ${formatValidation?.(result.issue) ?? labels.invalid}`);
          return;
        }
        change.limit = result.native;
      }
    }
    if (!changes.length) return;
    setError(null);
    const commandId = crypto.randomUUID();
    ownCommand.current = commandId;
    const answer = await action.run({
      kind: "allocations",
      commandId,
      expectedRevision: revision,
      changes,
    });
    finish(answer);
  };
  const Surface = variant === "plain" ? "div" : Card;
  return (
    <Surface className="w-full min-w-0">
      <CardHeader>
        <CardTitle className="leading-snug">{labels.title}</CardTitle>
        <CardDescription>{labels.description}</CardDescription>
      </CardHeader>
      <CardContent>
        <AllocationFormSurface id={formId} adapter={formAdapter} editable={editable} save={save}>
          {typeof evidenceBefore === "function" ? evidenceBefore(evidenceRows) : evidenceBefore}
          {help}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {rows.map((row) => (
              <AllocationRow
                key={row.id}
                row={row}
                field={fields[row.id]}
                rowLabels={rowLabels?.(row)}
                canRefreshBalance={canRefreshBalance}
                onRefreshNative={onRefreshNative}
                renderNativeObservation={renderNativeObservation}
                beginRefresh={beginRefresh}
                evidence={current(row)}
                draft={shown(row)}
                editable={mayEdit(row)}
                suggestionEligible={suggestionEligible}
                fresh={current(row) ? (suggestionEligible?.(current(row)!) ?? fresh) : false}
                inputPolicy={policy(row)}
                formatFigure={formatFigure}
                formatUnit={formatUnit}
                formatTime={formatTime}
                onRefreshBalance={onRefreshBalance}
                renderEvidence={renderEvidence}
                labels={labels}
                feedback={feedback}
                change={(value) => {
                  setDrafts((previous) => ({ ...previous, [row.id]: value }));
                  fields[row.id]?.setValue(value.limit);
                }}
                {...(projections?.[row.id] ? { projection: projections[row.id] } : {})}
              />
            ))}
          </div>
          {typeof evidenceAfter === "function" ? evidenceAfter(evidenceRows) : evidenceAfter}
          {!rows.length &&
            (emptyState ?? (
              <p className="rounded-lg border border-dashed px-4 py-3.5 text-sm border-border text-fg-muted">
                {labels.empty}
              </p>
            ))}
          {message && (
            <UsageNotice key={message} tone="error" role="alert">
              {message}
            </UsageNotice>
          )}
          {rows.length > 0 && (
            <AllocationSaveAction
              container={actionsContainer}
              formId={formAdapter ? formId : undefined}
              save={save}
              disabled={!editable || invalidated || !changedRows.length}
              pending={action.pending && submitted?.kind === "allocations"}
              label={labels.save}
            />
          )}
          <ProviderActionFeedback
            action={feedbackAction}
            labels={feedback}
            message={feedbackMessage}
            formatMessage={formatFeedback}
          />
        </AllocationFormSurface>
      </CardContent>
    </Surface>
  );
}
