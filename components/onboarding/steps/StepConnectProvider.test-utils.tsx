import { onboardingFormId } from "@/components/onboarding/onboarding-form-utils";
import { routerMock } from "@/tests/next-navigation";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ComponentProps } from "react";
import { expect, type vi } from "vitest";
import { StepConnectProvider } from "./StepConnectProvider";

export function defaultValues() {
  return {
    login: "provider-login",
    projectId: "prj_1",
    providerId: "dataforseo" as const,
    secret: "provider-password",
  };
}

export function renderProviderStep(
  props: Partial<ComponentProps<typeof StepConnectProvider>> = {},
) {
  return render(
    <>
      <StepConnectProvider defaultValues={defaultValues()} {...props} />
      <button form={onboardingFormId} type="submit">
        Continue
      </button>
    </>,
  );
}

export async function clickTestConnection(action: ReturnType<typeof vi.fn>, times = 1) {
  fireEvent.click(screen.getByRole("button", { name: "Test connection" }));
  await waitFor(() => expect(action).toHaveBeenCalledTimes(times));
}

export function clickContinue() {
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
}

export const push = routerMock.push;
