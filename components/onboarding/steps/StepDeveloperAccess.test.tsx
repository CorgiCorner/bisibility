import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { StepDeveloperAccess } from "./StepDeveloperAccess";

const refresh = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

describe("StepDeveloperAccess", () => {
  it("offers CLI login and explicit one-time API key creation", () => {
    render(<StepDeveloperAccess issueApiKeyAction={vi.fn()} projectId="prj_1" />);

    expect(screen.getByText("npm install -g @bisibility/cli")).toBeInTheDocument();
    expect(
      screen.getByText('bisibility auth login --name "mbp16-cli" --scope admin --expires 90'),
    ).toBeInTheDocument();
    expect(screen.getByText(/The full secret is shown once/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Create API key" }));

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(
      screen.getByText("Name the key and choose its access and expiry policy."),
    ).toBeInTheDocument();
  });

  it("allows dashboard-only users to continue without a key", () => {
    const onComplete = vi.fn();
    const { container } = render(
      <>
        <StepDeveloperAccess onComplete={onComplete} projectId="prj_1" />
        <button form="onboarding-step-form" type="submit">
          Continue
        </button>
      </>,
    );

    const form = container.querySelector("#onboarding-step-form");
    expect(form).not.toBeNull();
    if (form) fireEvent.submit(form);

    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it("recognizes an existing project key when onboarding is revisited", () => {
    render(<StepDeveloperAccess hasApiKey projectId="prj_1" />);

    expect(screen.getByText("Key ready")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create another key" })).toBeDisabled();
  });
});
