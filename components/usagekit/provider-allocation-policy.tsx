"use client";
import type {
  ProviderFeedbackLabels,
  ProviderFeedbackMessage,
  ProviderFeedbackSubject,
} from "@/components/usagekit/provider-feedback";
import { centsFromUsd, usdInput } from "@/components/usagekit/provider-feedback";
import { formatQuantity } from "@usagekit/core";
import type { ProviderAction } from "@usagekit/react";
import type {
  BudgetProjectionInput,
  Figure,
  ProviderActionResult,
  ProviderAllocationRow,
} from "@usagekit/views";
import { parseProviderDecimal } from "@usagekit/views";
import type { FocusEventHandler, FormEventHandler, ReactNode, Ref } from "react";
export type AllocationInputPolicy = {
  denomination?: "native" | "dollars";
  /** Empty input clears the limit and replaces the separate unlimited toggle. */
  blank?: "unlimited";
  /** Maximum input decimals. Native storage precision is checked independently. */
  precision?: number;
  nativePrecision?: number;
  min?: string;
  max?: string;
  unitLabel?: string;
};
export type AllocationValidationIssue = {
  code: "decimal" | "precision" | "minimum" | "maximum" | "storage" | "policy";
  row: ProviderAllocationRow;
};
export function allocationDisplay(
  text: string,
  row: ProviderAllocationRow,
  policy?: AllocationInputPolicy,
): string {
  if (policy?.denomination !== "dollars" || !["cents", "customer_cents"].includes(row.unit))
    return text;
  const dollars = usdInput(text);
  if (!dollars) return text;
  const [whole, fraction = ""] = dollars.split(".");
  return `${whole}.${fraction.replace(/0+$/, "").padEnd(2, "0")}`;
}
/** Initial display string shared by uncontrolled drafts and host form defaults. */
export function allocationDraftValue(
  row: ProviderAllocationRow,
  policy?: AllocationInputPolicy,
): string {
  return (policy?.blank === "unlimited" && row.unlimited) ||
    row.limit === "unavailable" ||
    row.limit.certainty === "unknown"
    ? ""
    : allocationDisplay(row.limit.text, row, policy);
}
/** Reasons are stable codes; parser English never reaches the editor. Bounds use native units. */
export function allocationInput(
  text: string,
  row: ProviderAllocationRow,
  policy: AllocationInputPolicy = {},
): { native: string } | { issue: AllocationValidationIssue } {
  const fail = (code: AllocationValidationIssue["code"]) => ({ issue: { code, row } });
  const dollar =
    policy.denomination === "dollars" && ["cents", "customer_cents"].includes(row.unit);
  const precision =
    policy.precision ??
    (dollar ? 2 : row.unit === "cents" || row.unit === "customer_cents" ? 4 : 18);
  if (!Number.isInteger(precision) || precision < 0 || precision > 18) return fail("policy");
  if (!/^\d+(\.\d+)?$/.test(text.trim())) return fail("decimal");
  if ((text.trim().split(".")[1]?.length ?? 0) > precision) return fail("precision");
  const native = dollar ? centsFromUsd(text.trim(), precision) : text.trim();
  if (native === null) return fail("storage");
  const parsed = parseProviderDecimal(native, row.unit, policy.nativePrecision);
  if (parsed.outcome !== "valid") return fail("storage");
  for (const [name, bound] of [
    ["minimum", policy.min],
    ["maximum", policy.max],
  ] as const) {
    if (bound === undefined) continue;
    const limit = parseProviderDecimal(bound, row.unit, policy.nativePrecision);
    if (limit.outcome !== "valid") return fail("policy");
    const a = parsed.quantity.value * 10n ** BigInt(limit.quantity.scale);
    const b = limit.quantity.value * 10n ** BigInt(parsed.quantity.scale);
    if (name === "minimum" ? a < b : a > b) return fail(name);
  }
  return { native: formatQuantity(parsed.quantity) };
}

export type AllocationField = {
  value: string;
  setValue: (value: string) => void;
  name?: string;
  ref?: Ref<HTMLInputElement>;
  onBlur?: FocusEventHandler<HTMLInputElement>;
  error?: string;
};
/** Host validation wraps the shared atomic save; values remain exact display strings. */
export type AllocationFormAdapter = {
  field: (row: ProviderAllocationRow) => AllocationField;
  handleSubmit: (save: () => Promise<void>) => FormEventHandler<HTMLFormElement>;
};
/** Only adapter-backed editors own a form and participate in submit/Enter behavior. */
export function AllocationFormSurface({
  adapter,
  id,
  editable,
  save,
  children,
}: {
  adapter?: AllocationFormAdapter;
  id?: string;
  editable: boolean;
  save: () => Promise<void>;
  children: ReactNode;
}) {
  const className = "gap-4 flex flex-col";
  return adapter ? (
    <form
      id={id}
      className={className}
      onSubmit={(event) => {
        event.preventDefault();
        if (editable) void adapter.handleSubmit(save)(event);
      }}
    >
      {children}
    </form>
  ) : (
    <div className={className}>{children}</div>
  );
}
export type AllocationRowLabels = {
  section: string;
  field: string;
  unlimited: string;
  limited: string;
  available: string;
  refreshBalance: string;
};
export type {
  AllocationNativeObservation,
  AllocationRowIdentity,
} from "@/lib/provider-ui/native-allocation-evidence";

import type { AllocationNativeObservation } from "@/lib/provider-ui/native-allocation-evidence";
export type AllocationRefreshState = { pending: boolean; failed: boolean };
export type AllocationProps = {
  rows: readonly ProviderAllocationRow[];
  formAdapter?: AllocationFormAdapter;
  /** Undefined renders actions inline; null waits for the host footer to mount. */
  actionsContainer?: HTMLElement | null;
  rowLabels?: (row: ProviderAllocationRow) => Partial<AllocationRowLabels>;
  canRefreshBalance?: (row: ProviderAllocationRow) => boolean;
  onRefreshNative?: (row: ProviderAllocationRow) => Promise<AllocationNativeObservation | null>;
  renderNativeObservation?: (
    observation: AllocationNativeObservation | null,
    row: ProviderAllocationRow,
    state: AllocationRefreshState,
  ) => ReactNode;
  /** Aggregate across all native and legacy balance refreshes, including stale in-flight work. */
  onRefreshPendingChange?: (pending: boolean) => void;
  emptyState?: ReactNode;
  feedbackMessage?: (subject: ProviderFeedbackSubject) => ProviderFeedbackMessage | null;
  formatFeedback?: (message: ProviderFeedbackMessage) => string;
  /** Omit for explicit-data presentation; panels supply current evidence or null. */
  evidenceRows?: readonly ProviderAllocationRow[] | null;
  action?: ProviderAction;
  revision: string;
  fresh?: boolean;
  projections?: Readonly<Record<string, BudgetProjectionInput>>;
  labels?: Partial<ProviderAllocationLabels>;
  feedbackLabels?: Partial<ProviderFeedbackLabels>;
  inputPolicy?: AllocationInputPolicy | ((row: ProviderAllocationRow) => AllocationInputPolicy);
  formatValidation?: (issue: AllocationValidationIssue) => string;
  formatFigure?: (figure: Exclude<Figure, "unavailable">) => string;
  formatUnit?: (unit: string) => string;
  formatTime?: (iso: string) => string;
  suggestionEligible?: (evidence: ProviderAllocationRow) => boolean;
  onRefreshBalance?: (row: ProviderAllocationRow) => Promise<ProviderAllocationRow | null>;
  renderEvidence?: (evidence: ProviderAllocationRow | null) => ReactNode;
  evidenceBefore?: ReactNode | ((rows: readonly ProviderAllocationRow[] | null) => ReactNode);
  evidenceAfter?: ReactNode | ((rows: readonly ProviderAllocationRow[] | null) => ReactNode);
  help?: ReactNode;
  variant?: "card" | "plain";
  onSaved?: (result: Extract<ProviderActionResult, { outcome: "success" }>) => void;
};

export function allocationEditorIdentity(props: AllocationProps) {
  return JSON.stringify([
    props.revision,
    typeof props.inputPolicy === "function" ? props.rows.map(props.inputPolicy) : props.inputPolicy,
    props.rows.map((row) => [
      row.id,
      row.revision,
      row.connectionId,
      row.fundingSource,
      row.surface,
      row.unit,
      row.limit,
      row.unlimited,
      row.editable,
    ]),
  ]);
}

export const providerAllocationLabels = {
  title: "Allocations",
  description:
    "Own-key units and customer credit limits are independent. A limit change never transfers a balance.",
  app: "App",
  programmatic: "Programmatic",
  limit: "Limit",
  unlimited: "No limit",
  limited: "Set a limit",
  used: "Used",
  reserved: "Reserved",
  remaining: "Remaining",
  available: "Use available balance",
  invalid: "Enter an exact nonnegative limit.",
  forecastUnavailable: "A budget forecast is unavailable.",
  unavailable: "Fresh, measured availability in the same unit is required.",
  save: "Save allocations",
  empty: "No allocation is configured.",
  forecast: "Budget forecast",
  estimated: "Estimated exhaustion",
  exhausted: "Exhausted",
  within: "Within this period",
  noUsage: "No measured usage yet",
  unknown: "Unknown",
  reload: "Refresh",
  refreshing: "Refreshing provider balance…",
  balanceShared:
    "This provider balance is shared. Suggested limit = usage this month + provider balance.",
  balanceWarning: "The remaining budget exceeds this provider account’s balance.",
  availabilityReasons: {
    owner_only: "Only the project owner can see usage for this key.",
    usage_unavailable: "Current usage is unavailable. Refresh to try again.",
    balance_unavailable: "Provider balance is unavailable. Refresh the provider balance.",
    balance_stale: "Provider balance is out of date. Refresh the provider balance.",
    balance_mismatch: "Provider balance does not match this key or unit. Refresh to try again.",
    budget_precision: "The suggested amount is not a valid whole budget unit.",
  },
  refreshBalance: "Refresh balance",
  refreshFailed: "Balance refresh is unavailable.",
};
export type ProviderAllocationLabels = typeof providerAllocationLabels;
