import { type SerpDepth, type SerpDevice, serpDepthValues } from "@/lib/serp/markets";
import type { RankCheckFrequency } from "@/lib/settings/options";
import {
  CALCULATOR_KEYWORD_MAX,
  CALCULATOR_KEYWORD_MIN,
  CALCULATOR_LOCATION_MAX,
  CALCULATOR_LOCATION_MIN,
  type CalculatorDefaults,
  type CalculatorDevices,
} from "./calculator-defaults";
import type { EstimateFrequency } from "./estimate";

type SearchParamValue = string | string[] | undefined;
type CalculatorSearchParams = Record<string, SearchParamValue>;

type CostCalculatorLinkInput = {
  depth: SerpDepth;
  devices: readonly SerpDevice[];
  frequency: RankCheckFrequency;
  keywordCount: number;
  locationCount: number;
};

export type CalculatorInputOverrides = Partial<
  Pick<
    CalculatorDefaults["inputs"],
    "depth" | "devices" | "frequency" | "keywordCount" | "locationCount"
  >
>;

const supportedFrequencies = new Set<EstimateFrequency>(["daily", "weekly", "monthly"]);
const supportedDevices = new Set<CalculatorDevices>(["desktop", "mobile", "both"]);

function firstValue(value: SearchParamValue) {
  return Array.isArray(value) ? value[0] : value;
}

function boundedInteger(value: SearchParamValue, minimum: number, maximum: number) {
  const parsed = Number(firstValue(value));
  return Number.isInteger(parsed) ? Math.min(maximum, Math.max(minimum, parsed)) : undefined;
}

function supportedFrequency(value: SearchParamValue) {
  const candidate = firstValue(value) as EstimateFrequency | undefined;
  return candidate && supportedFrequencies.has(candidate) ? candidate : undefined;
}

function supportedDevice(value: SearchParamValue) {
  const candidate = firstValue(value) as CalculatorDevices | undefined;
  return candidate && supportedDevices.has(candidate) ? candidate : undefined;
}

function supportedDepth(value: SearchParamValue) {
  const candidate = Number(firstValue(value));
  return serpDepthValues.includes(candidate as SerpDepth) ? (candidate as SerpDepth) : undefined;
}

function calculatorDevices(devices: readonly SerpDevice[]): CalculatorDevices {
  const selected = new Set(devices);
  if (selected.size > 1) return "both";
  return selected.has("mobile") ? "mobile" : "desktop";
}

export function buildCostCalculatorHref(input: CostCalculatorLinkInput) {
  if (!supportedFrequencies.has(input.frequency as EstimateFrequency)) return null;

  const params = new URLSearchParams({
    keywords: String(input.keywordCount),
    locations: String(input.locationCount),
    devices: calculatorDevices(input.devices),
    frequency: input.frequency,
    depth: String(input.depth),
  });
  return `/rank-tracking-cost-calculator?${params.toString()}`;
}

export function calculatorInputOverridesFromSearchParams(
  params: CalculatorSearchParams | undefined,
): CalculatorInputOverrides | undefined {
  if (!params) return undefined;

  const overrides: CalculatorInputOverrides = {};
  const depth = supportedDepth(params.depth);
  const devices = supportedDevice(params.devices);
  const frequency = supportedFrequency(params.frequency);
  const keywordCount = boundedInteger(
    params.keywords,
    CALCULATOR_KEYWORD_MIN,
    CALCULATOR_KEYWORD_MAX,
  );
  const locationCount = boundedInteger(
    params.locations,
    CALCULATOR_LOCATION_MIN,
    CALCULATOR_LOCATION_MAX,
  );

  if (depth !== undefined) overrides.depth = depth;
  if (devices !== undefined) overrides.devices = devices;
  if (frequency !== undefined) overrides.frequency = frequency;
  if (keywordCount !== undefined) overrides.keywordCount = keywordCount;
  if (locationCount !== undefined) overrides.locationCount = locationCount;

  if (Object.keys(overrides).length === 0) return undefined;
  return overrides;
}
