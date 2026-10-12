"use client";
import { Button } from "@/components/usagekit/primitives/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/usagekit/primitives/card";
import type { ProviderFeedbackLabels } from "@/components/usagekit/provider-feedback";
import {
  ProviderActionFeedback,
  ProviderReadFeedback,
  providerFeedbackLabels,
} from "@/components/usagekit/provider-feedback";
import type { ProviderRateLabels } from "@/components/usagekit/provider-rate-row";
import { ProviderRateRow, providerRateLabels } from "@/components/usagekit/provider-rate-row";
import { UsageSpinner } from "@/components/usagekit/usage-motion";
import type { ProviderAction } from "@usagekit/react";
import { useProviderAction, useProviderEditor } from "@usagekit/react";
import type { ProviderConnection } from "@usagekit/views";

export type { ProviderRateLabels } from "@/components/usagekit/provider-rate-row";
export { providerRateLabels } from "@/components/usagekit/provider-rate-row";
export function ProviderRateEditor({
  connection,
  evidence = connection,
  action: guardedAction,
  labels: custom,
  feedbackLabels,
}: {
  connection: ProviderConnection;
  /** Omit for explicit-data presentation; panels supply current evidence or null. */
  evidence?: ProviderConnection | null;
  action?: ProviderAction;
  labels?: Partial<ProviderRateLabels>;
  /** Status, funding and recovery copy shared with the other provider blocks. */
  feedbackLabels?: Partial<ProviderFeedbackLabels>;
}) {
  const labels = { ...providerRateLabels, ...custom };
  const feedback = { ...providerFeedbackLabels, ...feedbackLabels };
  const sharedAction = useProviderAction();
  const suppliedAction = guardedAction ?? sharedAction;
  const action = {
    ...suppliedAction,
    canWrite: suppliedAction.canWrite && evidence?.capabilities.includes("rates") === true,
  };
  const platform = connection.rates.filter((rate) => rate.fundingSource === "platform");
  const byok = connection.rates.filter((rate) => rate.fundingSource !== "platform");
  const allPlatform = platform.length > 0 && byok.length === 0;
  const rows = (rates: ProviderConnection["rates"]) => (
    <ul className="m-0 min-w-0 list-none divide-y divide-border border-t border-border p-0">
      {rates.map((rate) => (
        <ProviderRateRow
          key={`${rate.id}:${connection.revision}`}
          connection={connection}
          rate={rate}
          evidence={
            evidence?.id === connection.id && evidence.provider === connection.provider
              ? (evidence.rates.find(
                  (value) =>
                    value.id === rate.id &&
                    value.operation === rate.operation &&
                    value.priceUnit === rate.priceUnit &&
                    value.unit === rate.unit &&
                    value.fundingSource === rate.fundingSource,
                ) ?? null)
              : null
          }
          action={action}
          labels={labels}
          feedback={feedback}
        />
      ))}
    </ul>
  );
  return (
    <Card className="w-full min-w-0">
      <CardHeader>
        <CardTitle className="leading-snug">
          {allPlatform ? labels.platformTitle : labels.title}
        </CardTitle>
        <CardDescription>{allPlatform ? labels.platformNote : labels.description}</CardDescription>
      </CardHeader>
      <CardContent className="gap-4 flex flex-col">
        {byok.length > 0 && rows(byok)}
        {platform.length > 0 &&
          (allPlatform ? (
            rows(platform)
          ) : (
            <section aria-label={labels.platformTitle} className="space-y-2">
              <h3 className="text-sm font-semibold">{labels.platformTitle}</h3>
              <p className="text-sm text-fg-muted">{labels.platformNote}</p>
              {rows(platform)}
            </section>
          ))}
        {!connection.rates.length && <p className="text-sm text-fg-muted">{labels.empty}</p>}
        <ProviderActionFeedback action={action} labels={feedback} />
      </CardContent>
    </Card>
  );
}
export function ProviderRatePanel({
  connectionId,
  labels,
  feedbackLabels,
  evidenceAvailable = true,
  canEdit = true,
  onReload,
}: {
  connectionId: string;
  labels?: Partial<ProviderRateLabels>;
  feedbackLabels?: Partial<ProviderFeedbackLabels>;
  evidenceAvailable?: boolean;
  canEdit?: boolean;
  /** Runs first on every explicit reload, such as reverifying the host's access grant. */
  onReload?: () => void;
}) {
  const result = useProviderEditor({ kind: "details", connectionId });
  const action = { ...result.action, canWrite: result.canEdit && canEdit && evidenceAvailable };
  const disabled = action.pending || action.ambiguous || result.refreshing || !evidenceAvailable;
  // The host goes first, so a read it starts cannot outrun the reload that rebases the form.
  const reload = () => {
    onReload?.();
    result.reload();
  };
  if (!result.editorData?.connection)
    return (
      <ProviderReadFeedback
        state={result.state}
        error={result.error}
        refresh={reload}
        disabled={disabled}
        {...(feedbackLabels ? { labels: feedbackLabels } : {})}
      />
    );
  // A refused change already says so in the action feedback; the hidden evidence need not repeat it.
  const repeated = action.state === "forbidden" && result.state === "forbidden";
  return (
    <div className="space-y-3">
      <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={reload}>
        {result.refreshing && <UsageSpinner />}
        {labels?.reload ?? providerRateLabels.reload}
      </Button>
      {!result.evidence && !repeated && (
        <ProviderReadFeedback
          state={result.state}
          error={result.error}
          refresh={reload}
          disabled={disabled}
          {...(feedbackLabels ? { labels: feedbackLabels } : {})}
        />
      )}
      <ProviderRateEditor
        key={result.editorEpoch}
        connection={result.editorData.connection}
        evidence={evidenceAvailable ? (result.evidence?.connection ?? null) : null}
        action={action}
        {...(labels ? { labels } : {})}
        {...(feedbackLabels ? { feedbackLabels } : {})}
      />
    </div>
  );
}
