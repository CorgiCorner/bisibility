import type { MeasurementTranslator } from "./contracts";
import type { MeasurementActionState } from "./use-measurement-actions";

const namedBlocks = new Set([
  "measurement_policy_unconfigured",
  "measurement_policy_unsupported",
  "no_provider",
  "provider_disabled",
  "needs_reauth",
  "unsupported_surface",
  "capability_changed",
  "unsupported_device",
  "unsupported_geo",
  "unsupported_language",
  "unsupported_depth",
  "ambiguous_capability",
  "settings_conflict",
  "preview_required",
  "invalid_quote",
  "preview_expired",
  "preview_mismatch",
  "budget_missing",
  "budget_exhausted",
  "usage_reconciliation_required",
  "duplicate",
  "budget_blocked",
  "nothing_eligible",
  "cost_limit_exceeded",
  "sample_project",
  "rate_changed",
  "rate_unavailable",
  "preview_failed",
  "action_failed",
  "invalid_settings",
  "forbidden",
  "unsupported_capability",
  "save_intent_first",
  "scheduler_calendar_unavailable",
]);
export function measurementBlockMessage(code: string, t: MeasurementTranslator): string {
  return t(namedBlocks.has(code) ? `blocks.${code}` : "actionFailed");
}
export function MeasurementActionStatus({
  state,
  translate: t,
}: {
  state: MeasurementActionState;
  translate: MeasurementTranslator;
}) {
  const message = state.code
    ? measurementBlockMessage(state.code, t)
    : state.phase === "idle"
      ? ""
      : t(`phases.${state.phase}`);
  return (
    <p className="mt-3 text-sm text-fg-muted" role="status" aria-live="polite">
      {message}
    </p>
  );
}
