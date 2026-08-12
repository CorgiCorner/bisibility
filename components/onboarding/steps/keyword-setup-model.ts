import type { ProjectDefaultsInput } from "@/lib/schemas/project";
import { DEFAULT_SERP_DEVICE } from "@/lib/serp/markets";
import type { z } from "zod";
import type { AddKeywordsForm } from "./step-add-keywords-model";
import { addKeywordsFormSchema } from "./step-add-keywords-model";
import type { OnboardingTrackingDefaultsInput } from "./step-schedule-model";
import { onboardingTrackingDefaultsSchema } from "./step-schedule-model";

export const keywordSetupFormSchema = onboardingTrackingDefaultsSchema.extend({
  device: addKeywordsFormSchema.shape.device,
  keywords: addKeywordsFormSchema.shape.keywords,
});

export type KeywordSetupForm = z.infer<typeof keywordSetupFormSchema>;

export function keywordFormValues(values: KeywordSetupForm): AddKeywordsForm {
  return {
    device: values.devices[0] ?? DEFAULT_SERP_DEVICE,
    devices: values.devices,
    keywords: values.keywords,
    locations: values.locations,
    projectId: values.projectId,
  };
}

export function projectDefaultsInput(
  values: OnboardingTrackingDefaultsInput,
): ProjectDefaultsInput {
  return {
    city: values.city,
    country: values.country,
    cronExpression: values.cronExpression,
    device: values.device,
    frequency: values.frequency,
    jitterMinutes: values.jitterMinutes,
    locationKey: values.locationKey,
    projectId: values.projectId,
    serpDepth: values.serpDepth,
    timezone: values.timezone,
  };
}
