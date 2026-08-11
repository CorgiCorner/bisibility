import type { OnboardingConnectProviderInput } from "@/components/onboarding/steps/StepConnectProvider.fields";
import { onboardingFormId } from "./onboarding-form-utils";

function stringValue(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value : undefined;
}

export function readCurrentProviderValues(
  draftValues: OnboardingConnectProviderInput,
  flowProjectId?: string | null,
): OnboardingConnectProviderInput {
  if (typeof document === "undefined") {
    return draftValues;
  }

  const form = document.getElementById(onboardingFormId);
  if (!(form instanceof HTMLFormElement)) {
    return draftValues;
  }

  const values = new FormData(form);
  const costValue = stringValue(values.get("costPerCheck"));
  const costPerCheck = costValue?.trim() ? Number(costValue) : undefined;
  const providerId: OnboardingConnectProviderInput["providerId"] =
    stringValue(values.get("providerId")) === "serpapi" ? "serpapi" : "dataforseo";

  return {
    ...draftValues,
    costPerCheck: Number.isFinite(costPerCheck) ? costPerCheck : undefined,
    login: stringValue(values.get("login")) ?? "",
    projectId: stringValue(values.get("projectId")) ?? flowProjectId ?? draftValues.projectId,
    providerId,
    secret: stringValue(values.get("secret")) ?? "",
  };
}
