import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ComponentProps } from "react";
import { expect, vi } from "vitest";
import { StepConnectProvider } from "./StepConnectProvider";

export const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

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
  return render(<StepConnectProvider defaultValues={defaultValues()} {...props} />);
}

export async function clickTestConnection(action: ReturnType<typeof vi.fn>, times = 1) {
  fireEvent.click(screen.getByRole("button", { name: "Test connection" }));
  await waitFor(() => expect(action).toHaveBeenCalledTimes(times));
}
