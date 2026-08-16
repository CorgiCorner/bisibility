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

import {
  AUTO_PLAN_KEY,
  type CalculatorDefaults,
  type CalculatorDevices,
  type CalculatorInputs,
} from "@/lib/cost-estimate/calculator-defaults";
import type { ProviderRate } from "@/lib/cost-estimate/estimate";
import { centsToDollars } from "@/lib/format/currency";
import { createElement, Fragment } from "react";

export const sliderSx = {
  color: "var(--accent-solid)",
  height: 8,
  mx: 0.5,
  py: "18px",
  "&.MuiSlider-marked": { marginBottom: 0 },
  "& .MuiSlider-rail": {
    borderRadius: 999,
    color: "var(--meter-track)",
    height: 8,
    opacity: 1,
  },
  "& .MuiSlider-track": {
    backgroundColor: "var(--accent-solid)",
    border: "none",
    borderRadius: 999,
    height: 8,
  },
  "& .MuiSlider-mark": {
    backgroundColor: "var(--border-strong)",
    borderRadius: 999,
    height: 8,
    width: 2,
  },
  '& .MuiSlider-mark[style*="left:0%"]': { display: "none" },
  '& .MuiSlider-mark[style*="left:100%"]': { display: "none" },
  "& .MuiSlider-markActive": {
    backgroundColor: "var(--accent-on-solid)",
    opacity: 0.55,
  },
  "& .MuiSlider-thumb": {
    backgroundColor: "var(--accent-solid)",
    boxShadow: "0 0 0 3px var(--bg-elev)",
    height: 24,
    width: 24,
    "&::after": { height: 44, width: 44 },
    "&:hover, &.Mui-active": {
      boxShadow:
        "0 0 0 3px var(--bg-elev), 0 0 0 6px color-mix(in srgb, var(--accent-solid) 28%, transparent)",
    },
    "&.Mui-focusVisible": {
      boxShadow: "0 0 0 2px var(--bg-elev), 0 0 0 4px var(--accent)",
    },
  },
} as const;

export const numberFieldSx = {
  width: 112,
  "& .MuiInputBase-input": {
    color: "var(--fg)",
    fontFamily: "var(--font-mono), monospace",
    fontSize: "13px",
    // One value treatment for every slider: mono, semibold, in --fg. The accent was reserved
    // for the track and the selected segment, so the number no longer competes with them.
    fontWeight: 600,
    padding: "9px 10px",
    textAlign: "right",
  },
  "& .MuiOutlinedInput-notchedOutline": { borderColor: "var(--border-strong)" },
  "& .MuiOutlinedInput-root": {
    backgroundColor: "transparent",
    borderRadius: "10px",
  },
  "& .MuiOutlinedInput-root.Mui-focused .MuiOutlinedInput-notchedOutline": {
    borderColor: "var(--accent)",
  },
  "& .MuiOutlinedInput-root:hover .MuiOutlinedInput-notchedOutline": {
    borderColor: "var(--accent)",
  },
} as const;

// Deltas on top of the shared secondary/sm button: a muted resting label and an accent
// border on hover. Everything else already comes from the design-system variant.
export const resetButtonSx = {
  color: "var(--fg-muted)",
  "&:hover": {
    borderColor: "var(--accent)",
    color: "var(--fg)",
  },
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
  "ml-1 font-mono text-[11px] font-medium text-fg-muted whitespace-nowrap";

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
  optionClassName:
    "flex-row min-h-7 px-2.5 py-0.5 text-[12px] font-medium peer-checked:bg-nav-active peer-checked:font-semibold",
  size: "field" as const,
};
