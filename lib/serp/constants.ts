export const SERP_ENGINE = {
  id: "google",
  label: "Google",
} as const;

export const serpDepthValues = [10, 20, 50, 100] as const;
export type SerpDepth = (typeof serpDepthValues)[number];
export type SerpDevice = "desktop" | "mobile";

export const serpDeviceOptions = [
  { label: "Desktop", value: "desktop" },
  { label: "Mobile", value: "mobile" },
] as const satisfies readonly { label: string; value: SerpDevice }[];

export const serpDeviceValues = serpDeviceOptions.map((option) => option.value) as [
  SerpDevice,
  ...SerpDevice[],
];

export const DEFAULT_SERP_DEPTH = 100 satisfies SerpDepth;
export const DEFAULT_SERP_DEVICE = "desktop" satisfies SerpDevice;
export const DEFAULT_SERP_STOP_ON_MATCH = true;

export function resolveSerpDepth(value: number | undefined): SerpDepth {
  if (value === undefined) {
    return DEFAULT_SERP_DEPTH;
  }

  if (serpDepthValues.includes(value as SerpDepth)) {
    return value as SerpDepth;
  }

  throw new Error(`Unsupported SERP depth: ${value}`);
}

export function resolveEffectiveSerpDepth(input: {
  checkScheduleDepth?: number | null;
  projectDepth?: number | null;
  requestedDepth?: number | null;
  scheduleDepth?: number | null;
}) {
  // An assigned schedule owns depth; null explicitly follows the project.
  const scheduleDepth =
    input.checkScheduleDepth === undefined ? input.scheduleDepth : input.checkScheduleDepth;
  return resolveSerpDepth(input.requestedDepth ?? scheduleDepth ?? input.projectDepth ?? undefined);
}

export function resolveSerpStopOnMatch(value: boolean | null | undefined) {
  return value ?? DEFAULT_SERP_STOP_ON_MATCH;
}
