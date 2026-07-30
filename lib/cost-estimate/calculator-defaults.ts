import type { CalculatorPrefill } from "@/lib/queries/cost-calculator";
import type { SerpDepth } from "@/lib/serp/markets";
import type { EstimateFrequency } from "./estimate";
import { PROVIDER_RATES } from "./provider-rates";

export const AUTO_PLAN_KEY = "auto";

export type CalculatorDevices = "desktop" | "mobile" | "both";

export type CalculatorInputs = {
  depth: SerpDepth;
  keywordCount: number;
  locationCount: number;
  devices: CalculatorDevices;
  frequency: EstimateFrequency;
  providerId: string;
  flatOptionKey: string;
  planKey: string;
};

export type CalculatorDefaultInputs = Omit<CalculatorInputs, "planKey"> &
  Partial<Pick<CalculatorInputs, "planKey">>;

export type CalculatorDefaults = {
  inputs: CalculatorDefaultInputs;
  customCostPerCheckCents?: number;
  personalizedFrom?: string;
};

export const ANONYMOUS_CALCULATOR_DEFAULTS: CalculatorDefaults = {
  inputs: {
    depth: 100,
    keywordCount: 50,
    locationCount: 1,
    devices: "desktop",
    frequency: "daily",
    providerId: "dataforseo",
    flatOptionKey: "live",
    planKey: AUTO_PLAN_KEY,
  },
};

function devicesFromPrefill(prefill: CalculatorPrefill): CalculatorDevices {
  const trackedDevices = new Set(prefill.devices);
  if (trackedDevices.size === 1 && trackedDevices.has("mobile")) return "mobile";
  if (trackedDevices.size === 1 && trackedDevices.has("desktop")) return "desktop";
  return prefill.deviceCount > 1 ? "both" : "desktop";
}

export function defaultsFromPrefill(prefill: CalculatorPrefill): CalculatorDefaults {
  const providerId = PROVIDER_RATES.some((rate) => rate.providerId === prefill.providerId)
    ? (prefill.providerId ?? "dataforseo")
    : "dataforseo";

  return {
    ...(prefill.costPerCheckCents !== null
      ? { customCostPerCheckCents: prefill.costPerCheckCents }
      : {}),
    inputs: {
      depth: prefill.depth,
      devices: devicesFromPrefill(prefill),
      flatOptionKey: "live",
      frequency: prefill.frequency,
      keywordCount: Math.max(1, prefill.keywordCount),
      locationCount: prefill.locationCount,
      providerId,
    },
    personalizedFrom: prefill.projectName,
  };
}
