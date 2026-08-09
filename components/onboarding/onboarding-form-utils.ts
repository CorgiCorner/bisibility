import { inputClassName } from "@/components/ui";
import { DEFAULT_SERP_DEPTH, languageForSerpMarket, SERP_ENGINE } from "@/lib/serp/markets";

export const onboardingFormId = "onboarding-step-form";

export const inputClass = `${inputClassName} rounded-[9px] px-[13px] py-[11px] font-medium`;

export const labelClass =
  "flex flex-col gap-[7px] font-mono text-[10px] uppercase tracking-[0.5px] text-fg-muted";

export const feedbackClass = "text-[11.5px] font-medium normal-case tracking-normal";

export { actionErrorMessage } from "@/lib/ui/action-error";

export function keywordLines(value: string) {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

/**
 * Real, system-fixed tracking characteristics shown read-only in step 4. Provider
 * adapters map the app-level depth and market into their own API parameters.
 */
export const trackingDefaults = {
  engine: SERP_ENGINE.label,
  serpDepth: `Top ${DEFAULT_SERP_DEPTH}`,
} as const;

/**
 * Resolves the SERP language from the selected market so the read-only Language
 * field reflects the same canonical market map used by provider adapters.
 */
export function languageForCountry(country: string | undefined) {
  return languageForSerpMarket(country);
}

export function displayProvider(providerId?: string | null) {
  if (providerId === "dataforseo") {
    return "DataForSEO";
  }

  if (providerId === "serpapi") {
    return "SerpApi";
  }

  return "Skipped";
}
