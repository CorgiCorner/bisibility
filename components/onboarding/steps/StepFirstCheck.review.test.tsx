import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderReadyStep } from "./step-first-check-test-support";

describe("StepFirstCheck", () => {
  it("renders a three-fact review and final-step footer contract", () => {
    renderReadyStep({
      defaults: {
        city: null,
        country: "United States",
        cronExpression: "0 6 * * *",
        device: "desktop",
        devices: ["desktop", "mobile"],
        frequency: "daily",
        jitterMinutes: 60,
        locationKey: "US",
        locationSelections: [
          {
            canonicalKey: "US",
            countryCode: "US",
            displayName: "United States",
            kind: "country",
            languageCode: "en",
            languageLabel: "English",
          },
        ],
        locations: ["US"],
        projectId: "prj_1",
        serpDepth: 100,
        timezone: "UTC",
      },
      keywordDraft: "rank tracker\nseo api",
    });

    expect(screen.getByText("First check")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Everything's ready. Run your first check whenever you like - nothing runs until you start it.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText("Tracking: 3 keywords · Google · United States (English) · 2 devices"),
    ).toBeVisible();
    expect(
      screen.getByLabelText("Schedule: Manual - checks run when you start them"),
    ).toBeVisible();
    expect(screen.getByLabelText(/Data source: DataForSEO/)).toBeVisible();
    expect(screen.queryByText(/Sample keyword/i)).toBeNull();
    expect(screen.queryByText("Project")).toBeNull();
    expect(screen.queryByText("Review")).toBeNull();
    expect(screen.queryByRole("button", { name: "Keyword used for the sample checks" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Project timezone" })).not.toBeInTheDocument();
    for (const row of screen.getAllByLabelText(/^(Tracking|Schedule|Data source):/)) {
      const value = row.closest("[data-summary-value]");
      expect(value).toHaveClass("font-normal");
      expect(value).not.toHaveClass("font-medium", "font-semibold");
    }

    const openAppButton = screen.getByRole("button", { name: "Open app" });
    const runSampleChecksButton = screen.getByRole("button", {
      name: "Run check",
    });
    expect(openAppButton.closest("footer")).toHaveClass("-mx-6", "px-6", "sm:-mx-7", "sm:px-7");
    expect(openAppButton).toHaveAttribute("data-variant", "ghost");
    expect(openAppButton).toHaveAttribute("data-size", "lg");
    expect(openAppButton).toHaveAttribute("type", "submit");
    expect(runSampleChecksButton).toHaveAttribute("data-variant", "primary");
    expect(runSampleChecksButton).toHaveAttribute("data-size", "lg");
    expect(runSampleChecksButton).toHaveAttribute("type", "button");
  });

  it("does not expose a project timezone editor for an unscheduled first check", () => {
    const onTimezoneChange = vi.fn();
    renderReadyStep({
      defaults: {
        country: "United States",
        cronExpression: "0 6 * * *",
        device: "desktop",
        frequency: "daily",
        jitterMinutes: 60,
        projectId: "prj_1",
        timezone: "UTC",
      },
      onTimezoneChange,
    });
    expect(screen.queryByRole("button", { name: "Project timezone" })).not.toBeInTheDocument();
    expect(
      screen.getByLabelText("Schedule: Manual - checks run when you start them"),
    ).toBeVisible();
    expect(onTimezoneChange).not.toHaveBeenCalled();
  });

  it("combines keyword, engine, market, and device facts into Tracking", () => {
    renderReadyStep({
      keywordCount: 1,
      defaults: {
        country: "United States",
        cronExpression: null,
        device: "desktop",
        devices: ["desktop"],
        frequency: "manual",
        jitterMinutes: 60,
        locationSelections: [
          {
            canonicalKey: "US",
            countryCode: "US",
            displayName: "United States",
            kind: "country",
            languageCode: "en",
            languageLabel: "English",
          },
        ],
        locations: ["US"],
        projectId: "prj_1",
        timezone: "UTC",
      },
    });

    expect(
      screen.getByLabelText("Tracking: 1 keyword · Google · United States (English) · 1 device"),
    ).toHaveClass("truncate", "whitespace-nowrap");
    expect(
      screen.getByLabelText("Schedule: Manual - checks run when you start them"),
    ).toBeVisible();
  });

  it("does not expose a live-check action without a provider or analytics", () => {
    renderReadyStep({
      defaults: {
        country: "United States",
        cronExpression: null,
        device: "desktop",
        frequency: "manual",
        jitterMinutes: 60,
        projectId: "prj_1",
        timezone: "UTC",
      },
      flowState: { projectId: "prj_1", providerId: null },
      hasAnalyticsSource: false,
      providerConnected: false,
    });

    expect(screen.getByRole("button", { name: "Connect" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    expect(screen.queryByRole("button", { name: "Run check" })).toBeNull();
    const openAppButton = screen.getByRole("button", { name: "Open app" });
    expect(openAppButton).toHaveAttribute("data-variant", "primary");
    expect(openAppButton).toHaveAttribute("data-size", "lg");
    expect(openAppButton).toHaveAttribute("type", "submit");
    expect(
      screen
        .getAllByRole("button")
        .filter((button) => button.getAttribute("data-variant") === "primary"),
    ).toHaveLength(1);
    expect(
      screen.getByText(
        "Your keywords are ready. Choose a data source whenever you are ready to run checks.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Data source: Not connected")).toBeVisible();
    expect(screen.getByText("Checks start once a provider is connected.")).toBeVisible();
    expect(
      screen.getByLabelText("Schedule: Manual - checks run when you start them"),
    ).toBeVisible();
  });

  it("shows the connect-provider state when analytics is connected but no SERP provider is ready", () => {
    renderReadyStep({
      flowState: { projectId: "prj_1", providerId: null },
      hasAnalyticsSource: true,
      providerConnected: false,
    });

    expect(screen.getByRole("button", { name: "Connect" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    expect(screen.queryByRole("button", { name: /Show observed positions/i })).toBeNull();
    expect(screen.queryByRole("button", { name: "Run check" })).toBeNull();
  });

  it("allows manual preview while automatic checks are paused", () => {
    renderReadyStep({
      defaults: {
        country: "United States",
        cronExpression: null,
        device: "desktop",
        frequency: "paused",
        jitterMinutes: 60,
        projectId: "prj_1",
        timezone: "UTC",
      },
    });

    expect(screen.getByRole("button", { name: "Run check" })).not.toBeDisabled();
    expect(
      screen.getByLabelText("Schedule: Manual - checks run when you start them"),
    ).toBeVisible();
    expect(
      screen.getByText(
        "Everything's ready. Run your first check whenever you like - nothing runs until you start it.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "1 check runs once now so you can see it working. Nothing else runs automatically.",
      ),
    ).toBeInTheDocument();
  });

  it("does not offer live checks for sample projects", () => {
    renderReadyStep({
      flowState: {
        projectId: "prj_a11111111111111111111111",
        providerId: "dataforseo",
      },
      project: {
        domain: "sample.example",
        isSample: true,
        name: "Sample project",
        publicId: "prj_a11111111111111111111111",
      },
      providerConnected: true,
    });

    expect(screen.getByRole("button", { name: "Run check" })).toBeDisabled();
    expect(
      screen.getByText("Sample projects keep their synthetic ranking history."),
    ).toBeInTheDocument();
  });
});
