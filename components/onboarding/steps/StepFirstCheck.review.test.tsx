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
    expect(screen.getByText("Daily schedule")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open dashboard" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Run 2 sample checks" })).toBeInTheDocument();
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

  it("does not expose a live-check action without a provider or analytics", () => {
    renderReadyStep({
      flowState: { projectId: "prj_1", providerId: null },
      hasAnalyticsSource: false,
      providerConnected: false,
    });

    expect(screen.getByRole("link", { name: "Connect a provider" })).toHaveAttribute(
      "href",
      "/onboarding?step=2&projectId=prj_1",
    );
    expect(screen.queryByRole("button", { name: /Run \d+ sample checks?/ })).toBeNull();
    expect(screen.getByRole("button", { name: "Open dashboard" })).toBeInTheDocument();
  });

  it("shows the connect-provider state when analytics is connected but no SERP provider is ready", () => {
    renderReadyStep({
      flowState: { projectId: "prj_1", providerId: null },
      hasAnalyticsSource: true,
      providerConnected: false,
    });

    expect(screen.getByRole("link", { name: "Connect a provider" })).toHaveAttribute(
      "href",
      "/onboarding?step=2&projectId=prj_1",
    );
    expect(
      screen.getByText("Your keywords are saved. Connect a provider to run the first check."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Show observed positions/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /Run \d+ sample checks?/ })).toBeNull();
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

    expect(screen.getByRole("button", { name: /Run \d+ sample checks?/i })).not.toBeDisabled();
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

    expect(screen.getByRole("button", { name: "Run 1 sample check" })).toBeDisabled();
    expect(
      screen.getByText("Sample projects keep their synthetic ranking history."),
    ).toBeInTheDocument();
  });
});
