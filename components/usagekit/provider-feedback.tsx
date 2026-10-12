"use client";
import { Button } from "@/components/usagekit/primitives/button";
import type { UsageNoticeTone } from "@/components/usagekit/usage-motion";
import { UsageNotice, UsageSpinner, usageMotion } from "@/components/usagekit/usage-motion";
import type { useProviderAction } from "@usagekit/react";
import type { Figure, ProviderReconciliation } from "@usagekit/views";
import { parseProviderDecimal } from "@usagekit/views";

export const providerFeedbackLabels = {
  readOnly: "View only. Connection changes are managed by your administrator.",
  pending: "Applying change…",
  success: "Change applied.",
  forbidden: "You cannot make this change.",
  invalid: "Check the supplied values.",
  conflict: "This connection changed elsewhere. Reload its latest settings before editing.",
  unknown: "The result is unknown. Check its status before making another change.",
  reconcile: "Check change status",
  notApplied: "The previous change was not applied.",
  unavailable: "Connection management is unavailable.",
  loading: "Loading connection evidence…",
  empty: "No evidence is available yet.",
  reload: "Reload evidence",
  unknownValue: "Unknown",
  estimated: "Estimated",
  unavailableValue: "Unavailable",
  own: "Own key",
  platform: "Platform funded",
  cents: "cents",
};
export type ProviderFeedbackLabels = typeof providerFeedbackLabels;
/** Content-free host code and parameters. The formatter owns localization and safe labels. */
export type ProviderFeedbackMessage = {
  code: string;
  params?: Readonly<Record<string, string | number | boolean | null>>;
};
export type ProviderFeedbackSubject =
  | { kind: "action"; result: ProviderReconciliation | null; ambiguous: boolean }
  | { kind: "read"; state: string; error: { message?: string; kind?: string } | null };
type StructuredFeedbackProps = {
  message?:
    | ProviderFeedbackMessage
    | ((subject: ProviderFeedbackSubject) => ProviderFeedbackMessage | null);
  formatMessage?: (message: ProviderFeedbackMessage) => string;
};
function feedbackText(
  props: StructuredFeedbackProps,
  subject: ProviderFeedbackSubject,
  fallback: string | null,
  standard: string,
) {
  if (fallback === null) return null;
  const message = typeof props.message === "function" ? props.message(subject) : props.message;
  return message ? (props.formatMessage?.(message) ?? standard) : fallback;
}
export function fundingLabel(
  value: "byok" | "platform",
  labels: Pick<ProviderFeedbackLabels, "own" | "platform"> = providerFeedbackLabels,
) {
  return value === "byok" ? labels.own : labels.platform;
}
export function figureText(
  figure: Figure,
  labels: Pick<
    ProviderFeedbackLabels,
    "unavailableValue" | "unknownValue" | "estimated" | "cents"
  > = providerFeedbackLabels,
) {
  return figure === "unavailable"
    ? labels.unavailableValue
    : figure.certainty === "unknown"
      ? labels.unknownValue
      : `${figure.certainty === "estimated" ? `${labels.estimated} ` : ""}${figure.text} ${figure.unit === "customer_cents" || figure.unit === "cents" ? labels.cents : figure.unit}`;
}
/** Usagekit money is USD cents; dollars move the decimal point two places, never through a number. */
function dollarDigits(cents: string) {
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(cents.trim());
  if (!match) return null;
  const [, sign = "", whole = "", fraction = ""] = match;
  const scale = fraction.length + 2;
  const digits = (whole + fraction).replace(/^0+(?=\d)/, "").padStart(scale + 1, "0");
  return {
    negative: sign === "-" && /[1-9]/.test(digits),
    whole: digits.slice(0, -scale),
    fraction: digits.slice(-scale),
  };
}
/** "0.6250" cents reads "$0.00625": every significant digit and at least two decimals. */
export function usdText(cents: string) {
  const parts = dollarDigits(cents);
  if (!parts) return null;
  const whole = parts.whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const fraction = parts.fraction.replace(/0+$/, "").padEnd(2, "0");
  return `${parts.negative ? "−" : ""}$${whole}.${fraction}`;
}
/** Dollars as input text at the exact scale, so "1250.00" cents reads back as "12.5000". */
export function usdInput(cents: string) {
  const parts = dollarDigits(cents);
  return parts ? `${parts.negative ? "-" : ""}${parts.whole}.${parts.fraction}` : null;
}
/** Exact cents for typed dollars, or null. Six decimal places keep cents within four. */
export function centsFromUsd(text: string, maximumScale = 6) {
  const parsed = parseProviderDecimal(text, "USD", maximumScale);
  if (parsed.outcome === "invalid") return null;
  const { value, scale } = parsed.quantity;
  const cents =
    scale >= 2
      ? { value, scale: scale - 2 }
      : { value: value * 10n ** BigInt(2 - scale), scale: 0 };
  const digits = cents.value.toString().padStart(cents.scale + 1, "0");
  return cents.scale ? `${digits.slice(0, -cents.scale)}.${digits.slice(-cents.scale)}` : digits;
}
/** ISO instants read as "2026-10-07 10:00 UTC"; any other host text is shown unchanged. */
export function ProviderTime({
  value,
  formatTime,
}: {
  value: string;
  formatTime?: (iso: string) => string;
}) {
  const iso = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})(:\d{2}(\.\d+)?)?Z$/.exec(value);
  return (
    <time dateTime={value}>{formatTime?.(value) ?? (iso ? `${iso[1]} ${iso[2]} UTC` : value)}</time>
  );
}
export function ProviderActionFeedback({
  action,
  labels: custom,
  message: structured,
  formatMessage,
}: {
  action: ReturnType<typeof useProviderAction>;
  labels?: Partial<ProviderFeedbackLabels>;
} & StructuredFeedbackProps) {
  const labels = { ...providerFeedbackLabels, ...custom };
  const result = action.result;
  const fallback = action.ambiguous
    ? labels.unknown
    : result?.outcome === "success"
      ? labels.success
      : result?.outcome === "invalid"
        ? labels.invalid
        : result?.outcome === "conflict"
          ? labels.conflict
          : result?.outcome === "forbidden"
            ? labels.forbidden
            : result?.outcome === "unavailable"
              ? labels.unavailable
              : null;
  const standard = action.ambiguous
    ? labels.unknown
    : result?.outcome === "success"
      ? labels.success
      : result?.outcome === "conflict"
        ? labels.conflict
        : result?.outcome === "forbidden"
          ? labels.forbidden
          : result?.outcome === "invalid"
            ? labels.invalid
            : labels.unavailable;
  const message = action.pending
    ? null
    : feedbackText(
        { message: structured, formatMessage },
        { kind: "action", result, ambiguous: action.ambiguous },
        fallback,
        standard,
      );
  const tone: UsageNoticeTone =
    result?.outcome === "success" && !action.ambiguous
      ? "positive"
      : action.ambiguous || result?.outcome === "conflict"
        ? "warning"
        : "error";
  if (action.canWrite && !action.pending && !message && !action.ambiguous) return null;
  return (
    <div className="min-w-0 space-y-2.5">
      {!action.canWrite && (
        <p role="status" className="text-sm text-fg-muted">
          {labels.readOnly}
        </p>
      )}
      {action.pending ? (
        <p
          role="status"
          className={`text-sm flex items-center gap-2 text-fg-muted ${usageMotion.enter}`}
        >
          <UsageSpinner />
          {labels.pending}
        </p>
      ) : (
        message && (
          <UsageNotice key={message} tone={tone}>
            {message}
          </UsageNotice>
        )
      )}
      {action.ambiguous && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={action.pending}
          className={usageMotion.enter}
          onClick={() => {
            if (!action.pending) void action.reconcile();
          }}
        >
          {labels.reconcile}
        </Button>
      )}
    </div>
  );
}
export function ProviderReadFeedback({
  state,
  error,
  refresh,
  disabled = false,
  labels: custom,
  message: structured,
  formatMessage,
}: {
  state: string;
  error?: { message?: string; kind?: string } | null;
  refresh: () => void;
  disabled?: boolean;
  labels?: Partial<ProviderFeedbackLabels>;
} & StructuredFeedbackProps) {
  const labels = { ...providerFeedbackLabels, ...custom };
  const standard =
    state === "forbidden"
      ? labels.forbidden
      : state === "empty"
        ? labels.empty
        : labels.unavailable;
  const fallback = standard;
  const message =
    state === "loading"
      ? labels.loading
      : feedbackText(
          { message: structured, formatMessage },
          { kind: "read", state, error: error ?? null },
          fallback,
          standard,
        );
  return (
    <div
      role="status"
      className={`rounded-lg border border-dashed px-4 py-3.5 text-sm flex min-w-0 flex-wrap items-center justify-between gap-3 border-border ${usageMotion.enter}`}
    >
      <p className="flex min-w-0 items-center gap-2 text-fg-muted">
        {state === "loading" && <UsageSpinner />}
        {message}
      </p>
      {state !== "loading" && (
        <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={refresh}>
          {labels.reload}
        </Button>
      )}
    </div>
  );
}
