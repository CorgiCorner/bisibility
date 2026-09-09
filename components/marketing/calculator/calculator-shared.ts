export {
  ANONYMOUS_CALCULATOR_DEFAULTS,
  AUTO_PLAN_KEY,
  CALCULATOR_KEYWORD_MAX,
  CALCULATOR_KEYWORD_MIN,
  CALCULATOR_LOCATION_MAX,
  CALCULATOR_LOCATION_MIN,
  type CalculatorDefaultInputs,
  type CalculatorDefaults,
  type CalculatorDevices,
  type CalculatorInputs,
} from "@/lib/cost-estimate/calculator-defaults";

import type { CostEstimateInput } from "@/lib/cost-estimate/api-contract";
import {
  AUTO_PLAN_KEY,
  type CalculatorDefaults,
  type CalculatorDevices,
  type CalculatorInputs,
} from "@/lib/cost-estimate/calculator-defaults";
import type { ProviderRate } from "@/lib/cost-estimate/estimate";
import { centsToDollars } from "@/lib/format/currency";
import { createElement, Fragment } from "react";

// Deltas on top of the shared secondary/sm button: a muted resting label and an accent
// border on hover. Everything else already comes from the design-system variant.
export const resetButtonStyle = {
  "--control-color": "var(--fg-muted)",
  "--control-hover-border-color": "var(--accent)",
  "--control-hover-color": "var(--fg)",
} as const;

export function clampInteger(value: number, min: number, max?: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  const next = Math.max(min, Math.floor(value));
  return max === undefined ? next : Math.min(next, max);
}

export function deviceCountFor(devices: CalculatorDevices): 1 | 2 {
  return devices === "both" ? 2 : 1;
}

export function normalizeCalculatorInputs(inputs: CalculatorDefaults["inputs"]): CalculatorInputs {
  return { ...inputs, planKey: inputs.planKey ?? AUTO_PLAN_KEY };
}

export function optionKeyFor(rate: ProviderRate, current: string) {
  if (rate.pricingModel !== "flat") return current;
  return rate.options.some((option) => option.key === current)
    ? current
    : (rate.options[0]?.key ?? current);
}

export function selectedPlanKey(planKey: string) {
  return planKey === "" || planKey === AUTO_PLAN_KEY ? undefined : planKey;
}

export function pluralCount(count: number, noun: string) {
  return `${formatChecks(count)} ${noun}${count === 1 ? "" : "s"}`;
}

export function formatCentsAsDollars(cents: number, fractionDigits = 2): string {
  const digits = Math.min(Math.max(Math.floor(fractionDigits), 0), 6);

  return new Intl.NumberFormat("en-US", {
    currency: "USD",
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
    style: "currency",
  }).format(centsToDollars(cents));
}

export function formatChecks(value: number): string {
  return value.toLocaleString("en-US");
}

export const monoHintClass =
  "ml-1 font-sans text-[11px] font-medium text-fg-muted whitespace-nowrap";

export function hintLabel(label: string, hint: string) {
  return createElement(
    Fragment,
    null,
    label,
    createElement("span", { className: monoHintClass }, `(${hint})`),
  );
}

export const neutralSegmentProps = {
  className: "min-w-0 [&>div]:gap-0.5",
  optionClassName: "flex-row min-h-7 px-2.5 py-0.5 text-[12px] font-medium",
  size: "field" as const,
};

export function calculatorEstimateInput(inputs: CalculatorInputs): CostEstimateInput {
  return {
    keywordCount: inputs.keywordCount,
    locationCount: inputs.locationCount,
    deviceCount: deviceCountFor(inputs.devices),
    depth: inputs.depth,
    frequency: inputs.frequency,
    providerId: inputs.providerId,
    optionKey: inputs.flatOptionKey,
    planKey: inputs.planKey,
  };
}
