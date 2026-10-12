"use client";
import { Button } from "@/components/usagekit/primitives/button";
import { Input } from "@/components/usagekit/primitives/input";
import { Label } from "@/components/usagekit/primitives/label";
import { useAllocationObservation } from "@/components/usagekit/provider-allocation-observation";
import type {
  AllocationField,
  AllocationInputPolicy,
  AllocationProps,
  AllocationRowLabels,
  ProviderAllocationLabels,
} from "@/components/usagekit/provider-allocation-policy";
import { allocationDisplay } from "@/components/usagekit/provider-allocation-policy";
import type { ProviderFeedbackLabels } from "@/components/usagekit/provider-feedback";
import { figureText, fundingLabel } from "@/components/usagekit/provider-feedback";
import { UsageStatus, usageMotion } from "@/components/usagekit/usage-motion";
import type { BudgetProjectionInput, Figure, ProviderAllocationRow } from "@usagekit/views";
import { allocationLimitFromAvailable, projectBudgetExhaustion } from "@usagekit/views";
import type { ReactNode } from "react";
import { useId } from "react";

export type { ProviderAllocationLabels } from "@/components/usagekit/provider-allocation-policy";
export { providerAllocationLabels } from "@/components/usagekit/provider-allocation-policy";
export type Draft = { limit: string; unlimited: boolean };
export function AllocationRow({
  row,
  evidence = row,
  draft,
  change,
  editable,
  fresh,
  labels,
  feedback,
  projection,
  inputPolicy,
  formatFigure,
  formatUnit,
  formatTime,
  onRefreshBalance,
  renderEvidence,
  suggestionEligible,
  field,
  rowLabels,
  canRefreshBalance,
  onRefreshNative,
  renderNativeObservation,
  beginRefresh = () => () => {},
}: {
  row: ProviderAllocationRow;
  field?: AllocationField;
  rowLabels?: Partial<AllocationRowLabels>;
  canRefreshBalance?: AllocationProps["canRefreshBalance"];
  onRefreshNative?: AllocationProps["onRefreshNative"];
  renderNativeObservation?: AllocationProps["renderNativeObservation"];
  beginRefresh?: () => () => void;
  /** Current evidence only. Null preserves the draft without displaying retained figures. */
  evidence?: ProviderAllocationRow | null;
  draft: Draft;
  change: (value: Draft) => void;
  editable: boolean;
  fresh: boolean;
  suggestionEligible?: (evidence: ProviderAllocationRow) => boolean;
  labels: ProviderAllocationLabels;
  feedback: ProviderFeedbackLabels;
  projection?: BudgetProjectionInput;
  inputPolicy?: AllocationInputPolicy;
  formatFigure?: (figure: Exclude<Figure, "unavailable">) => string;
  formatUnit?: (unit: string) => string;
  formatTime?: (iso: string) => string;
  onRefreshBalance?: (row: ProviderAllocationRow) => Promise<ProviderAllocationRow | null>;
  renderEvidence?: (evidence: ProviderAllocationRow | null) => ReactNode;
}) {
  const id = useId();
  const { observed, refresh, availability } = useAllocationObservation({
    evidence,
    editable,
    onRefreshBalance,
    onRefreshNative,
    beginRefresh,
  });
  const blankUnlimited = inputPolicy?.blank === "unlimited";
  const errorId = `${id}-error`;
  const refreshVisible = canRefreshBalance?.(row) ?? true;
  const display = (value: Figure) =>
    value !== "unavailable" && value.certainty !== "unknown"
      ? `${value.certainty === "estimated" ? `${feedback.estimated} ` : ""}${formatFigure?.(value) ?? value.text} ${formatUnit?.(value.unit) ?? (value.unit === "cents" || value.unit === "customer_cents" ? feedback.cents : value.unit)}`
      : figureText(value, feedback);
  const available =
    (observed?.row ? (suggestionEligible?.(observed.row) ?? fresh) : fresh) &&
    evidence &&
    availability?.available &&
    availability.availabilityBasis
      ? allocationLimitFromAvailable({
          used: evidence.used,
          reserved: evidence.reserved,
          available: availability.available,
          availabilityBasis: availability.availabilityBasis,
        })
      : { outcome: "unavailable" as const, reason: labels.unavailable };
  const suggestion =
    available.outcome === "ready" && available.limit.unit === row.unit
      ? allocationDisplay(available.limit.text, row, inputPolicy)
      : null;
  const forecast = evidence && projection ? projectBudgetExhaustion(projection) : null;
  return (
    <section
      aria-label={
        rowLabels?.section ?? `${fundingLabel(row.fundingSource, feedback)} ${labels[row.surface]}`
      }
      className="rounded-md border px-4 py-3.5 gap-4 flex min-w-0 flex-col border-border"
    >
      <div className="min-w-0 space-y-0.5">
        <h3 className="text-sm font-medium">
          {fundingLabel(row.fundingSource, feedback)}
          <span className="text-fg-muted"> {labels[row.surface]}</span>
        </h3>
        <p className="text-sm break-words text-fg-muted">{row.label}</p>
      </div>
      {evidence && (
        <dl className="rounded-lg bg-bg-sunken p-4 text-sm grid min-w-0 grid-cols-3 gap-3">
          {[
            [labels.used, evidence.used],
            [labels.reserved, evidence.reserved],
            [labels.remaining, evidence.remaining],
          ].map(([label, value]) => (
            <div key={label as string} className="min-w-0">
              <dt className="text-xs text-fg-muted">{label as string}</dt>
              <dd
                key={display(value as ProviderAllocationRow["used"])}
                className={`mt-0.5 break-all font-medium tabular-nums ${usageMotion.enter}`}
              >
                {display(value as ProviderAllocationRow["used"])}
              </dd>
            </div>
          ))}
        </dl>
      )}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Label htmlFor={id}>
            {labels.limit} (
            {inputPolicy?.unitLabel ??
              formatUnit?.(row.unit) ??
              (inputPolicy?.denomination === "dollars" &&
              ["cents", "customer_cents"].includes(row.unit)
                ? "USD"
                : row.unit === "customer_cents" || row.unit === "cents"
                  ? feedback.cents
                  : row.unit)}
            )
          </Label>
          {!blankUnlimited && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={!editable}
              aria-pressed={draft.unlimited}
              onClick={() => change({ ...draft, unlimited: !draft.unlimited })}
            >
              {draft.unlimited
                ? (rowLabels?.limited ?? labels.limited)
                : (rowLabels?.unlimited ?? labels.unlimited)}
            </Button>
          )}
        </div>
        <Input
          id={id}
          name={field?.name}
          ref={field?.ref}
          onBlur={field?.onBlur}
          aria-label={rowLabels?.field}
          aria-invalid={field?.error ? true : undefined}
          aria-describedby={field?.error ? errorId : undefined}
          type="text"
          inputMode="decimal"
          readOnly={!editable}
          disabled={blankUnlimited ? !editable : draft.unlimited}
          value={draft.limit}
          className="tabular-nums"
          onChange={(event) => {
            if (editable)
              change({
                ...draft,
                limit: event.target.value,
                unlimited: blankUnlimited ? event.target.value.trim() === "" : draft.unlimited,
              });
          }}
        />
        {field?.error && (
          <p id={errorId} role="alert" className="text-xs/relaxed text-red-text">
            {field.error}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!editable || suggestion === null}
            onClick={() => {
              if (suggestion !== null) change({ limit: suggestion, unlimited: false });
            }}
          >
            {rowLabels?.available ?? labels.available}
          </Button>
          {suggestion === null && (
            <p className="text-xs/relaxed min-w-0 flex-1 basis-48 text-fg-muted">
              {labels.unavailable}
            </p>
          )}
        </div>
      </div>
      {renderEvidence?.(
        evidence && observed && !onRefreshNative
          ? {
              ...evidence,
              available: observed.row?.available,
              availabilityBasis: observed.row?.availabilityBasis,
            }
          : evidence,
      )}
      {renderNativeObservation?.(observed?.native ?? null, row, {
        pending: observed?.pending ?? false,
        failed: observed?.failed ?? false,
      })}
      {refreshVisible && (onRefreshNative ? row.fundingSource === "byok" : onRefreshBalance) && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!editable || !evidence || observed?.pending}
          onClick={() => void refresh()}
        >
          {rowLabels?.refreshBalance ?? labels.refreshBalance}
        </Button>
      )}
      {observed?.pending && <p role="status">{feedback.pending}</p>}
      {observed?.failed && <p role="alert">{labels.refreshFailed}</p>}
      {forecast && (
        <div className="text-sm flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 border-t border-border pt-3">
          <span className="text-fg-muted">{labels.forecast}</span>
          <UsageStatus
            tone={
              forecast.kind === "exhausted"
                ? "exceeded"
                : forecast.kind === "estimated"
                  ? "warning"
                  : forecast.kind === "within_limits"
                    ? "positive"
                    : "neutral"
            }
          >
            {forecast.kind === "estimated"
              ? `${labels.estimated} ${formatTime?.(forecast.at) ?? forecast.at}`
              : forecast.kind === "exhausted"
                ? `${labels.exhausted} ${formatTime?.(forecast.at) ?? forecast.at}`
                : forecast.kind === "within_limits"
                  ? labels.within
                  : forecast.kind === "no_usage"
                    ? labels.noUsage
                    : labels.forecastUnavailable}
          </UsageStatus>
        </div>
      )}
    </section>
  );
}
