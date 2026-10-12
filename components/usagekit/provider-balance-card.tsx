"use client";
import { Badge } from "@/components/usagekit/primitives/badge";
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
  figureText,
  fundingLabel,
  ProviderReadFeedback,
  ProviderTime,
  providerFeedbackLabels,
} from "@/components/usagekit/provider-feedback";
import { UsageSpinner, UsageStatus, usageMotion } from "@/components/usagekit/usage-motion";
import { useProviderBalance, useProviderProjection } from "@usagekit/react";
import type { ProviderBalance, ProviderProjection, ProviderQuery } from "@usagekit/views";
export const providerBalanceLabels = {
  title: "Balance",
  balance: "Available balance",
  reserved: "Reserved",
  provider: "Provider account",
  host_wallet: "Host credit wallet",
  unknown: "Unknown authority",
  observed: "Observed",
  stale: "Stale evidence",
  unavailable: "Unavailable",
  reload: "Reload evidence",
  quote: "Request estimate",
  quantity: "Quantity",
  cost: "Provider cost",
  charge: "Customer charge",
  yes: "Can proceed",
  no: "Cannot proceed",
  uncertain: "Unknown",
  availabilityAvailable: "Available",
  availabilityUnavailable: "Not available",
  availabilityUnknown: "Availability unknown",
};
export type ProviderBalanceLabels = typeof providerBalanceLabels;
export function ProviderBalanceCard({
  balance,
  labels: custom,
  feedbackLabels,
}: {
  balance: ProviderBalance;
  labels?: Partial<ProviderBalanceLabels>;
  feedbackLabels?: Partial<ProviderFeedbackLabels>;
}) {
  const labels = { ...providerBalanceLabels, ...custom };
  const feedback = { ...providerFeedbackLabels, ...feedbackLabels };
  const availability =
    balance.availability.state === "available"
      ? labels.availabilityAvailable
      : balance.availability.state === "unavailable"
        ? labels.availabilityUnavailable
        : labels.availabilityUnknown;
  return (
    <Card className="w-full min-w-0">
      <CardHeader>
        <div className="flex min-w-0 flex-wrap items-start justify-between gap-x-3 gap-y-1">
          <CardTitle className="leading-snug">{labels.title}</CardTitle>
          {balance.freshness.stale && <Badge variant="outline">{labels.stale}</Badge>}
        </div>
        <CardDescription className="flex flex-wrap gap-x-2">
          <span>{labels[balance.authority]}</span>
          <span>{fundingLabel(balance.fundingSource, feedback)}</span>
        </CardDescription>
      </CardHeader>
      <CardContent className="gap-4 flex flex-col">
        <dl className="grid min-w-0 gap-4 sm:grid-cols-2">
          {[
            [labels.balance, balance.balance],
            [labels.reserved, balance.reserved],
          ].map(([title, value]) => (
            <div key={title as string} className="min-w-0">
              <dt className="text-xs text-fg-muted">{title as string}</dt>
              <dd
                key={figureText(value as ProviderBalance["balance"], feedback)}
                className={`text-2xl tracking-tight mt-1 break-all font-semibold tabular-nums ${usageMotion.enter}`}
              >
                {figureText(value as ProviderBalance["balance"], feedback)}
              </dd>
            </div>
          ))}
        </dl>
        <UsageStatus
          tone={
            balance.availability.state === "available"
              ? "positive"
              : balance.availability.state === "unavailable"
                ? "exceeded"
                : "unknown"
          }
        >
          {availability}
        </UsageStatus>
        {balance.availability.reason && (
          <p className="text-sm break-words">{balance.availability.reason}</p>
        )}
        <p className="text-xs/relaxed break-all text-fg-muted tabular-nums">
          {labels.observed}:{" "}
          {balance.freshness.observedAt ? (
            <ProviderTime value={balance.freshness.observedAt} />
          ) : (
            labels.unavailable
          )}
        </p>
      </CardContent>
    </Card>
  );
}
export function ProviderBalancePanel({
  connectionId,
  labels,
  feedbackLabels,
  onReload,
}: {
  connectionId: string;
  /** Runs first on every explicit reload to reverify host access. */
  onReload?: () => void;
  labels?: Partial<ProviderBalanceLabels>;
  feedbackLabels?: Partial<ProviderFeedbackLabels>;
}) {
  const result = useProviderBalance({ connectionId });
  const reload = () => {
    onReload?.();
    result.refresh();
  };
  if (!result.data?.balance || result.state !== "ok")
    return (
      <ProviderReadFeedback
        state={result.state}
        error={result.error}
        refresh={reload}
        disabled={result.refreshing}
        {...(feedbackLabels ? { labels: feedbackLabels } : {})}
      />
    );
  return (
    <div className="space-y-3">
      <ProviderBalanceCard
        balance={result.data.balance}
        {...(labels ? { labels } : {})}
        {...(feedbackLabels ? { feedbackLabels } : {})}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={result.refreshing}
        onClick={reload}
      >
        {result.refreshing && <UsageSpinner />}
        {labels?.reload ?? providerBalanceLabels.reload}
      </Button>
    </div>
  );
}
export function ProviderRequestQuote({
  projection,
  labels: custom,
  feedbackLabels,
}: {
  projection: ProviderProjection;
  labels?: Partial<ProviderBalanceLabels>;
  feedbackLabels?: Partial<ProviderFeedbackLabels>;
}) {
  const labels = { ...providerBalanceLabels, ...custom };
  const feedback = { ...providerFeedbackLabels, ...feedbackLabels };
  return (
    <Card className="w-full min-w-0">
      <CardHeader>
        <div className="flex min-w-0 flex-wrap items-start justify-between gap-x-3 gap-y-1">
          <CardTitle className="leading-snug">{labels.quote}</CardTitle>
          <UsageStatus
            tone={
              projection.canProceed === "unknown"
                ? "unknown"
                : projection.canProceed === "yes"
                  ? "positive"
                  : "exceeded"
            }
          >
            {projection.canProceed === "unknown" ? labels.uncertain : labels[projection.canProceed]}
          </UsageStatus>
        </div>
        {projection.reason && <CardDescription>{projection.reason}</CardDescription>}
      </CardHeader>
      <CardContent>
        <dl className="min-w-0 divide-y divide-border">
          {[
            [labels.quantity, projection.quantity],
            [labels.cost, projection.providerCost],
            [labels.charge, projection.customerCharge],
          ].map(([title, value]) => (
            <div
              key={title as string}
              className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 py-2.5 first:pt-0 last:pb-0"
            >
              <dt className="text-sm text-fg-muted">{title as string}</dt>
              <dd className="text-sm break-all font-medium tabular-nums">
                {figureText(value as ProviderProjection["quantity"], feedback)}
              </dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}
export function ProviderRequestQuotePanel({
  query,
  labels,
  feedbackLabels,
  onReload,
}: {
  query: Extract<ProviderQuery, { kind: "projection" }>;
  /** Runs first on every explicit reload to reverify host access. */
  onReload?: () => void;
  labels?: Partial<ProviderBalanceLabels>;
  feedbackLabels?: Partial<ProviderFeedbackLabels>;
}) {
  const result = useProviderProjection(query);
  const reload = () => {
    onReload?.();
    result.refresh();
  };
  if (!result.data?.projection || result.state !== "ok")
    return (
      <ProviderReadFeedback
        state={result.state}
        error={result.error}
        refresh={reload}
        disabled={result.refreshing}
        {...(feedbackLabels ? { labels: feedbackLabels } : {})}
      />
    );
  return (
    <ProviderRequestQuote
      projection={result.data.projection}
      {...(labels ? { labels } : {})}
      {...(feedbackLabels ? { feedbackLabels } : {})}
    />
  );
}
