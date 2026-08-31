import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderReadyStep } from "./step-first-check-test-support";

describe("StepFirstCheck", () => {
  it("renders the complete review table and final-step footer contract", () => {
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

    for (const label of [
      "Project",
      "Provider",
      "Keywords",
      "Scope",
      "Markets",
      "First check",
      "Sample keyword",
      "Next scheduled run",
    ]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    expect(
      screen.getByRole("button", { name: "Keyword used for the sample checks" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Project timezone" })).toBeInTheDocument();
    expect(screen.getByText("Google · 1 market · 2 devices · Daily")).toBeInTheDocument();
    expect(screen.queryByText("Google / 1 market / 2 devices / Daily")).toBeNull();
    expect(screen.getByText("Daily schedule")).toBeInTheDocument();
    expect(screen.getByText("·")).toBeInTheDocument();
    expect(screen.queryByText("/")).toBeNull();
    const openAppButton = screen.getByRole("button", { name: "Open app" });
    const runSampleChecksButton = screen.getByRole("button", {
      name: "Run a test check (1 keyword)",
    });
    expect(openAppButton).toBeInTheDocument();
    expect(openAppButton).toHaveClass("MuiButton-text", "MuiButton-sizeLarge");
    expect(openAppButton).toHaveAttribute("type", "submit");
    expect(openAppButton.querySelector("svg")).toBeNull();
    expect(runSampleChecksButton).toBeInTheDocument();
    expect(runSampleChecksButton).toHaveClass("MuiButton-contained", "MuiButton-sizeLarge");
    expect(runSampleChecksButton).toHaveAttribute("type", "button");
    expect(runSampleChecksButton.querySelector("svg")).toBeNull();
    expect(
      screen
        .getAllByRole("button")
        .filter((button) => button.classList.contains("MuiButton-contained")),
    ).toHaveLength(1);
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

  it("renders Scope and Markets as distinct truncating summary rows", () => {
    renderReadyStep({
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

    const scopeLabel = screen.getByText("Scope");
    const marketsLabel = screen.getByText("Markets");
    expect(scopeLabel.closest("[data-summary-row]")).not.toBe(
      marketsLabel.closest("[data-summary-row]"),
    );
    const scopeValue = screen.getByLabelText("Scope: Google · 1 market · 1 device · Manual");
    const marketsValue = screen.getByLabelText("Markets: United States / English");
    expect(scopeValue).toHaveClass("truncate", "whitespace-nowrap");
    expect(marketsValue).toHaveClass("truncate", "whitespace-nowrap");
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
    expect(screen.getByText("Waiting for a provider")).toBeInTheDocument();
    expect(screen.getByText(/rank tracker/)).toBeInTheDocument();
    expect(screen.getByText("Manual · runs only when you start it")).toBeInTheDocument();
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
  it("hides matrix transparency for one market and one device", () => {
    renderReadyStep({ keywordCount: 1, keywordDraft: "rank tracker" });
    expect(screen.getByText("1 keyword saved")).toBeInTheDocument();
    expect(screen.queryByText(/1 keyword · 1 market/)).not.toBeInTheDocument();
  });

  it("uses plural persisted saved-count copy", () => {
    renderReadyStep({ keywordCount: 2 });
    expect(screen.getByText("2 keywords saved")).toBeInTheDocument();
  });
});
