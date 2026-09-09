import {
  DEFAULT_SERP_DEPTH,
  SERP_ENGINE,
  type SerpDepth,
  type SerpDevice,
  serpDeviceValues,
} from "@/lib/serp/constants";

export { DEFAULT_ONBOARDING_FREQUENCY } from "@/lib/onboarding/defaults";

export type OnboardingStepNumber = 1 | 2 | 3 | 4;
export const DEFAULT_ONBOARDING_DEVICE: SerpDevice = "mobile";
export type OnboardingIconKey = "database" | "folder" | "lightning" | "search";

export type OnboardingStep = {
  n: OnboardingStepNumber;
  title: string;
  desc: string;
  icon: OnboardingIconKey;
  /** Rendered as an "optional" tag in the step rail; the step can be skipped. */
  optional?: boolean;
};

export const onboardingSteps = [
  { n: 1, title: "Website", desc: "Name and domain", icon: "folder" },
  {
    n: 2,
    title: "Provider",
    desc: "SERP provider and search insights",
    icon: "database",
  },
  {
    n: 3,
    title: "Keywords",
    desc: "Keywords and tracking defaults",
    icon: "search",
  },
  { n: 4, title: "First check", desc: "Run it and open your dashboard", icon: "lightning" },
] satisfies OnboardingStep[];

export const totalOnboardingSteps = onboardingSteps.length;

export type OnboardingFlowState = {
  devices?: readonly SerpDevice[];
  locations?: readonly string[];
  projectId?: string | null;
  providerId?: string | null;
  serpDepth?: SerpDepth;
};

export const onboardingDefaults = {
  addKeywords: "",
  apiLogin: "",
  apiPassword: "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022",
  country: "United States",
  device: "Mobile",
  domain: "acme.dev",
  engine: SERP_ENGINE.label,
  language: "English",
  projectId: "prj_7Kd2Qf9m",
  projectName: "Acme",
  provider: "DataForSEO",
  refresh: "Manual",
  serpDepth: `Top ${DEFAULT_SERP_DEPTH}`,
} as const;

export function buildOnboardingStepHref(step: OnboardingStepNumber, state?: OnboardingFlowState) {
  const params = new URLSearchParams({ step: String(step) });

  if (state?.projectId) {
    params.set("projectId", state.projectId);
  }

  if (state?.providerId) {
    params.set("providerId", state.providerId);
  }

  for (const location of state?.locations ?? []) {
    params.append("loc", location);
  }

  for (const device of state?.devices ?? []) {
    params.append("device", device);
  }

  return `/onboarding?${params.toString()}`;
}

export function normalizeOnboardingStep(
  value: string | string[] | undefined,
): OnboardingStepNumber {
  const raw = Array.isArray(value) ? value[0] : value;
  const parsed = Number.parseInt(raw ?? "1", 10);

  if (parsed >= 1 && parsed <= totalOnboardingSteps) {
    return parsed as OnboardingStepNumber;
  }

  return 1;
}

export function maxSupportedOnboardingStep({
  keywordCount,
  projectId,
}: {
  keywordCount: number;
  projectId?: string | null;
}): OnboardingStepNumber {
  if (!projectId) {
    return 1;
  }

  return keywordCount > 0 ? 4 : 3;
}

export function clampOnboardingStep(
  step: OnboardingStepNumber,
  maxStep: OnboardingStepNumber,
): OnboardingStepNumber {
  return step > maxStep ? maxStep : step;
}

export function normalizeOnboardingDevices(values: readonly string[] | undefined): SerpDevice[] {
  const devices = [
    ...new Set(
      (values ?? []).flatMap((value) => {
        const normalized = value.toLowerCase();
        return serpDeviceValues.includes(normalized as SerpDevice)
          ? [normalized as SerpDevice]
          : [];
      }),
    ),
  ] as SerpDevice[];
  return devices.length > 0 ? devices : [DEFAULT_ONBOARDING_DEVICE];
}

export function countKeywordLines(value: string) {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean).length;
}
