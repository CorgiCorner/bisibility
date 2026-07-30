export {
  ANONYMOUS_CALCULATOR_DEFAULTS,
  AUTO_PLAN_KEY,
  type CalculatorDefaultInputs,
  type CalculatorDefaults,
  type CalculatorDevices,
  type CalculatorInputs,
} from "@/lib/cost-estimate/calculator-defaults";

import type { CalculatorDevices } from "@/lib/cost-estimate/calculator-defaults";
import { centsToDollars } from "@/lib/format/currency";

export const sliderSx = {
  color: "var(--accent)",
  mx: 0.5,
  "& .MuiSlider-rail": { color: "var(--border-strong)", opacity: 1 },
  "& .MuiSlider-thumb": { boxShadow: "0 0 0 3px var(--bg-elev)" },
} as const;

export const numberFieldSx = {
  width: 112,
  "& .MuiInputBase-input": {
    color: "var(--fg)",
    fontFamily: "var(--font-mono), monospace",
    fontSize: "13px",
    padding: "9px 10px",
    textAlign: "right",
  },
  "& .MuiOutlinedInput-notchedOutline": { borderColor: "var(--border-strong)" },
  "& .MuiOutlinedInput-root": {
    backgroundColor: "var(--bg-sunken)",
    borderRadius: "10px",
  },
  "& .MuiOutlinedInput-root.Mui-focused .MuiOutlinedInput-notchedOutline": {
    borderColor: "var(--accent)",
  },
  "& .MuiOutlinedInput-root:hover .MuiOutlinedInput-notchedOutline": {
    borderColor: "var(--accent)",
  },
} as const;

export const resetButtonSx = {
  backgroundColor: "var(--bg-elev)",
  border: "1px solid var(--border-strong)",
  borderRadius: "9px",
  color: "var(--fg-muted)",
  fontSize: "12.5px",
  fontWeight: 600,
  minHeight: 34,
  padding: "6px 12px",
  textTransform: "none",
  "&:hover": {
    backgroundColor: "var(--bg-sunken)",
    borderColor: "var(--accent)",
    color: "var(--fg)",
  },
} as const;

export function deviceCountFor(devices: CalculatorDevices): 1 | 2 {
  return devices === "both" ? 2 : 1;
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
