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

import type { CalculatorDevices } from "@/lib/cost-estimate/calculator-defaults";
import { centsToDollars } from "@/lib/format/currency";

export const sliderSx = {
  color: "var(--accent)",
  height: 8,
  mx: 0.5,
  // 18px of transparent padding around an 8px rail gives the control a 44px pointer band
  // without drawing anything taller. MUI's own coarse-pointer padding is overridden by this
  // sx block, so the comfortable target has to be stated here.
  py: "18px",
  // Marks would otherwise push the min/max row down on the stepped slider only, and the two
  // sliders have to line up.
  "&.MuiSlider-marked": { marginBottom: 0 },
  // A thicker track so the filled portion up to the current value reads as the value itself,
  // next to the numeric field.
  "& .MuiSlider-rail": {
    borderRadius: 999,
    color: "var(--border-strong)",
    height: 8,
    opacity: 1,
  },
  "& .MuiSlider-track": {
    backgroundColor: "var(--accent)",
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
  // The first and last stop sit exactly on the rail's rounded caps, where a 2px notch reads as
  // a stray element cutting the corner rather than as a tick. Both ends are already stated by
  // the min/max labels underneath, so the ticks there carry nothing.
  // Matched on MUI's inline position rather than data-index, so this holds for any number of
  // stops. `:last-of-type` does not work here - the marks and the thumb are all spans, so it
  // selects the thumb.
  '& .MuiSlider-mark[style*="left:0%"]': { display: "none" },
  '& .MuiSlider-mark[style*="left:100%"]': { display: "none" },
  "& .MuiSlider-markActive": {
    backgroundColor: "var(--accent-on-solid)",
    opacity: 0.55,
  },
  // No halo ring: it was drawn in --bg-elev and only disappeared while the panel used the
  // same fill. Hover comes from the accent itself.
  "& .MuiSlider-thumb": {
    boxShadow: "none",
    height: 18,
    width: 18,
    // MUI's 42px hit pseudo-element, widened to the comfortable 44px. Transparent, so the
    // visible thumb stays 18px.
    "&::after": { height: 44, width: 44 },
    "&:hover, &.Mui-active": {
      boxShadow: "0 0 0 3px color-mix(in srgb, var(--accent) 28%, transparent)",
    },
    // MUI marks the focused thumb with .Mui-focusVisible, not :focus-visible, so the old
    // selector never matched and keyboard focus landed on the thumb with no ring at all.
    // A solid double ring also tells focus apart from hover.
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
