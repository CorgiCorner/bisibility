import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { StepAddKeywords } from "./StepAddKeywords";
import type { OnboardingTrackingDefaultsInput } from "./step-schedule-model";

function keywordBox() {
  return screen.getByPlaceholderText("One keyword per line");
}

describe("StepAddKeywords schedule summary", () => {
  it("renders mobile and manual as the new onboarding defaults", () => {
    render(<StepAddKeywords flowState={{ projectId: "prj_1" }} />);

    expect(screen.getByRole("button", { name: "Devices" })).toHaveTextContent("Mobile");
    expect(screen.getByRole("button", { name: "Frequency" })).toHaveTextContent("Manual");
  });

  it("warns near the keyword limit and projects daily checks", () => {
    render(
      <StepAddKeywords
        flowState={{ devices: ["desktop", "mobile"], locations: ["US", "PL"], projectId: "prj_1" }}
        trackingDefaults={{ frequency: "daily" } as OnboardingTrackingDefaultsInput}
      />,
    );
    fireEvent.change(keywordBox(), {
      target: { value: Array.from({ length: 450 }, (_, index) => `keyword ${index}`).join("\n") },
    });
    expect(screen.getByText("approaching the 500-keyword import limit")).toBeInTheDocument();
    expect(
      screen.getByText("450 keywords × 2 devices × 2 locations = 1800 checks"),
    ).toBeInTheDocument();
    expect(screen.getByText("≈ 54000 checks/month at Top 20")).toBeInTheDocument();
  });

  it("projects weekly checks from the tracking draft", () => {
    render(
      <StepAddKeywords
        flowState={{ projectId: "prj_1", providerId: "serpapi" }}
        trackingDefaults={{ frequency: "weekly" } as OnboardingTrackingDefaultsInput}
      />,
    );
    fireEvent.change(keywordBox(), { target: { value: "rank tracker\nseo api" } });
    expect(screen.getByText("≈ 8 checks/month at Top 20")).toBeInTheDocument();
  });

  it("places usage after defaults and updates it from frequency, devices, and depth", async () => {
    render(<StepAddKeywords flowState={{ projectId: "prj_1", providerId: "dataforseo" }} />);
    fireEvent.change(keywordBox(), { target: { value: "rank tracker\nseo api" } });

    const defaultsHeading = screen.getByRole("heading", { name: "Tracking defaults" });
    const initialEstimate = screen.getByText("≈ 0 checks/month at Top 20");
    expect(
      defaultsHeading.compareDocumentPosition(initialEstimate) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);

    fireEvent.click(screen.getByRole("button", { name: "Frequency" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Monthly" }));
    expect(screen.getByText("≈ 2 checks/month at Top 20")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Devices" }));
    fireEvent.click(screen.getByRole("menuitemcheckbox", { name: "Desktop" }));
    expect(screen.getByText("≈ 4 checks/month at Top 20")).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole("menu", { name: "Devices" }), { key: "Escape" });
    await waitFor(() =>
      expect(screen.queryByRole("menu", { name: "Devices" })).not.toBeInTheDocument(),
    );

    fireEvent.click(screen.getByRole("button", { name: "SERP depth" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Top 10" }));
    expect(screen.getByText("≈ 4 checks/month at Top 10")).toBeInTheDocument();
  });

  it("excludes an unparseable custom cron schedule instead of pricing it at zero", () => {
    render(
      <StepAddKeywords
        costPerCheckCents={5}
        flowState={{ projectId: "prj_1" }}
        trackingDefaults={
          {
            cronExpression: "not a cron",
            frequency: "custom_cron",
          } as OnboardingTrackingDefaultsInput
        }
      />,
    );
    fireEvent.change(keywordBox(), { target: { value: "rank tracker" } });
    expect(screen.getByText("excludes custom cron schedule at Top 20")).toBeInTheDocument();
    expect(screen.queryByText(/\$0\.00\/month/)).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Estimate provider cost" })).toBeNull();
  });

  it("shows and focuses the market error after removing the final market", async () => {
    const onComplete = vi.fn();
    render(
      <>
        <StepAddKeywords flowState={{ projectId: "prj_1" }} onComplete={onComplete} />
        <button form={onboardingFormId} type="submit">
          Continue
        </button>
      </>,
    );

    const remove = screen.getByRole("button", { name: "Remove United States / English" });
    expect(remove).toBeEnabled();
    fireEvent.click(remove);

    const error = await screen.findByText("Add at least one market to continue.");
    const addMarket = screen.getByRole("button", { name: "Add market" });
    const markets = screen.getByRole("region", { name: "Markets" });
    expect(error).toHaveAttribute("id", "onboarding-markets-error");
    expect(markets).toHaveAttribute("aria-describedby", "onboarding-markets-error");
    expect(markets).not.toHaveAttribute("aria-invalid");
    expect(addMarket).toHaveAttribute("aria-describedby", "onboarding-markets-error");
    expect(addMarket).not.toHaveAttribute("aria-invalid");

    fireEvent.change(keywordBox(), { target: { value: "rank tracker" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    await waitFor(() => expect(screen.getByRole("region", { name: "Markets" })).toHaveFocus());
    expect(onComplete).not.toHaveBeenCalled();
  });

  it("saves tracking defaults with keywords and keeps language inside market chips", async () => {
    const onComplete = vi.fn();
    const updateProjectDefaultsAction = vi.fn(async () => undefined);
    render(
      <>
        <StepAddKeywords
          flowState={{ projectId: "prj_1", providerId: "serpapi" }}
          onComplete={onComplete}
          updateProjectDefaultsAction={updateProjectDefaultsAction}
        />
        <button form={onboardingFormId} type="submit">
          Continue
        </button>
      </>,
    );

    expect(screen.getByRole("button", { name: "Remove United States / English" })).toBeEnabled();
    expect(screen.queryByLabelText("Language")).not.toBeInTheDocument();
    fireEvent.change(keywordBox(), { target: { value: "rank tracker" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    await waitFor(() =>
      expect(updateProjectDefaultsAction).toHaveBeenCalledWith({
        city: null,
        country: "United States",
        cronExpression: "0 6 * * *",
        device: "mobile",
        frequency: "manual",
        jitterMinutes: 60,
        locationKey: "US",
        projectId: "prj_1",
        serpDepth: 20,
        timezone: "UTC",
      }),
    );
    expect(onComplete).toHaveBeenCalledWith(
      expect.objectContaining({ keywords: "rank tracker" }),
      expect.objectContaining({ locations: ["US"] }),
      1,
    );
  });
});

import { onboardingFormId } from "@/components/onboarding/onboarding-form-utils";
