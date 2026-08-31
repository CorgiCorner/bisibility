import { fireEvent, screen } from "@testing-library/react";
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

    expect(screen.getByText("Review")).toBeInTheDocument();
    expect(
      screen.getByText("Everything's ready. Your first check runs daily."),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText("Tracking: 3 keywords · Google · United States (English) · 2 devices"),
    ).toBeVisible();
    expect(screen.getByLabelText("Schedule: Daily · UTC")).toBeVisible();
    expect(screen.getByLabelText(/Data source: DataForSEO/)).toBeVisible();
    expect(screen.queryByText(/Sample keyword/i)).toBeNull();
    expect(screen.queryByText("Project")).toBeNull();
    expect(screen.queryByText("First check")).toBeNull();
    expect(screen.queryByRole("button", { name: "Keyword used for the sample checks" })).toBeNull();
    expect(screen.getByRole("button", { name: "Project timezone" })).toBeInTheDocument();
    for (const row of screen.getAllByLabelText(/^(Tracking|Schedule|Data source):/)) {
      const value = row.closest("[data-summary-value]");
      expect(value).toHaveClass("font-normal");
      expect(value).not.toHaveClass("font-medium", "font-semibold");
    }

    const openAppButton = screen.getByRole("button", { name: "Open app" });
    const runSampleChecksButton = screen.getByRole("button", {
      name: "Run a test check (1 keyword)",
    });
    expect(openAppButton.closest("footer")).toHaveClass("-mx-6", "px-6", "sm:-mx-7", "sm:px-7");
    expect(openAppButton).toHaveClass("MuiButton-text", "MuiButton-sizeLarge");
    expect(openAppButton).toHaveAttribute("type", "submit");
    expect(runSampleChecksButton).toHaveClass("MuiButton-contained", "MuiButton-sizeLarge");
    expect(runSampleChecksButton).toHaveAttribute("type", "button");
  });

  // This case opens the timezone menu, which renders the full IANA zone list. It measures ~800ms
  // locally while every other case in this file stays between 4ms and 164ms, so it is the only one
  // here with no headroom under the 5s default. On a slower runner that packs more files into a
  // single shard it crosses 5s repeatably while passing everywhere else. The timeout covers the
  // measured cost; it does not paper over a hang, and shrinking the rendered zone list would
  // remove the need for it.
  it("restores the saved timezone when an update fails", async () => {
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
      onTimezoneChange: vi.fn(async () => {
        throw new Error("save failed");
      }),
    });

    fireEvent.click(screen.getByRole("button", { name: "Project timezone" }));
    fireEvent.click(screen.getByRole("menuitem", { name: /Europe\/Warsaw/ }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Timezone could not be saved");
    expect(screen.getByRole("button", { name: "Project timezone" })).toHaveTextContent("UTC");
  }, 20_000);

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
    expect(screen.queryByRole("button", { name: "Run a test check (1 keyword)" })).toBeNull();
    const openAppButton = screen.getByRole("button", { name: "Open app" });
    expect(openAppButton).toHaveClass("MuiButton-contained", "MuiButton-sizeLarge");
    expect(openAppButton).toHaveAttribute("type", "submit");
    expect(
      screen
        .getAllByRole("button")
        .filter((button) => button.classList.contains("MuiButton-contained")),
    ).toHaveLength(1);
    expect(
      screen.getByText(
        "Almost ready. Everything is set - connect a data provider whenever you want to run checks.",
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
    expect(screen.queryByRole("button", { name: "Run a test check (1 keyword)" })).toBeNull();
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

    expect(screen.getByRole("button", { name: "Run a test check (1 keyword)" })).not.toBeDisabled();
    expect(screen.getByLabelText("Schedule: Paused - no checks are scheduled")).toBeVisible();
    expect(
      screen.getByText("Everything's ready. Checks are paused until you resume the schedule."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Manual preview can run now. Scheduled checks stay paused."),
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

    expect(screen.getByRole("button", { name: "Run a test check (1 keyword)" })).toBeDisabled();
    expect(
      screen.getByText("Sample projects keep their synthetic ranking history."),
    ).toBeInTheDocument();
  });
});
