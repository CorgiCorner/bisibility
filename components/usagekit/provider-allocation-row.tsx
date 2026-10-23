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
import {
  allocationDisplay,
  allocationInput,
} from "@/components/usagekit/provider-allocation-policy";
import type { ProviderFeedbackLabels } from "@/components/usagekit/provider-feedback";
import { figureText, fundingLabel } from "@/components/usagekit/provider-feedback";
import { nativeAllocationAvailability } from "@/lib/provider-ui/native-allocation-evidence";
import { ArrowClockwiseIcon } from "@phosphor-icons/react/dist/csr/ArrowClockwise";
import type { BudgetProjectionInput, Figure, ProviderAllocationRow } from "@usagekit/views";
import { allocationLimitFromAvailable, projectBudgetExhaustion } from "@usagekit/views";
import type { ReactNode } from "react";
import { useId } from "react";
import { AllocationCurrentEvidence } from "./AllocationCurrentEvidence";
import { AllocationForecast } from "./AllocationForecast";

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
  const { observed, native, refresh, availability, availabilityReason, invalidateNative } =
    useAllocationObservation({
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
      ? `${formatFigure?.(value) ?? `${value.certainty === "estimated" ? `${feedback.estimated} ` : ""}${value.text}`} ${formatUnit?.(value.unit) ?? (value.unit === "cents" || value.unit === "customer_cents" ? feedback.cents : value.unit)}`
      : figureText(value, feedback);
  const available =
    (availability ? (suggestionEligible?.(availability) ?? fresh) : fresh) &&
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
  const parsedDraft = !draft.unlimited ? allocationInput(draft.limit, row, inputPolicy) : null;
  const draftAvailability =
    native && evidence && parsedDraft && "native" in parsedDraft
      ? nativeAllocationAvailability(
          {
            ...evidence,
            unlimited: false,
            limit: { text: parsedDraft.native, unit: evidence.unit, certainty: "measured" },
          },
          native,
        )
      : null;
  const exceedsProviderBalance =
    draftAvailability?.outcome === "ready" && draftAvailability.exceedsProviderBalance;
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
        <AllocationCurrentEvidence evidence={evidence} labels={labels} display={display} />
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
              if (suggestion === null) return;
              if (row.fundingSource === "byok" && native) {
                const current = nativeAllocationAvailability(evidence ?? row, native);
                if (current.outcome !== "ready") {
                  invalidateNative(current.reason);
                  return;
                }
              }
              change({ limit: suggestion, unlimited: false });
            }}
          >
            {rowLabels?.available ?? labels.available}
          </Button>
          {suggestion === null && (
            <p className="text-xs/relaxed min-w-0 flex-1 basis-48 text-fg-muted">
              {availabilityReason
                ? labels.availabilityReasons[availabilityReason]
                : labels.unavailable}
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
      {onRefreshNative
        ? row.fundingSource === "byok" && (
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              {renderNativeObservation?.(native, row, {
                pending: observed?.pending ?? false,
                failed: observed?.failed ?? false,
              })}
              {refreshVisible && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 min-h-7 shrink-0 gap-1.5 px-2 text-xs"
                  aria-label={rowLabels?.refreshBalance ?? labels.refreshBalance}
                  title={rowLabels?.refreshBalance ?? labels.refreshBalance}
                  disabled={!editable || !evidence || observed?.pending}
                  onClick={() => void refresh()}
                >
                  <ArrowClockwiseIcon
                    weight="regular"
                    aria-hidden
                    size={14}
                    className={
                      observed?.pending ? "animate-spin motion-reduce:animate-none" : undefined
                    }
                  />
                  {labels.reload}
                </Button>
              )}
            </div>
          )
        : refreshVisible &&
          onRefreshBalance && (
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
      {row.fundingSource === "byok" && native && (
        <p className="text-xs text-fg-muted">{labels.balanceShared}</p>
      )}
      {exceedsProviderBalance && (
        <p role="status" className="text-xs text-yellow-text">
          {labels.balanceWarning}
        </p>
      )}
      {observed?.pending && <p role="status">{labels.refreshing}</p>}
      {observed?.failed && <p role="alert">{labels.refreshFailed}</p>}
      {forecast && (
        <AllocationForecast forecast={forecast} labels={labels} formatTime={formatTime} />
      )}
    </section>
  );
}
