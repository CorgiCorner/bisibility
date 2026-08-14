import { TrackingDefaultsCard } from "@/components/settings/tracking/TrackingDefaultsCard";
import type { CronPreviewResult } from "@/lib/actions/settings-cron-preview";
import type { DefaultsData } from "@/lib/settings/options";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const defaults: DefaultsData = {
  city: null,
  costPerCheck: 0.0155,
  country: "Poland",
  device: "Desktop",
  deviceCount: 1,
  inspectionDailyLimit: 100,
  keywordCount: 248,
  locationCount: 1,
  locationKey: "PL",
  locationLabel: "Poland",
  schedule: {
    cron_expression: null,
    frequency: "monthly",
    jitter_minutes: 60,
    last_checked_at: null,
    next_check_at: "2026-08-15T06:00:00.000Z",
    timezone: "Europe/Warsaw",
  },
  serpDepth: 100,
  serpStopOnMatch: true,
  targetUrlCount: 12,
};

const readyPreview: CronPreviewResult = {
  message: "Each keyword is scheduled at or after an anchor using deterministic jitter.",
  runs: ["Aug 10, 06:00", "Aug 11, 06:00", "Aug 12, 06:00"],
  status: "ready",
};

function renderCard(overrides: Partial<DefaultsData> = {}) {
  const updateDefaults = vi.fn(async () => ({}));
  const previewCron = vi.fn(async () => readyPreview);
  render(
    <TrackingDefaultsCard
      canEdit
      defaults={{ ...defaults, ...overrides }}
      initialCronPreview={readyPreview}
      previewCron={previewCron}
      projectId="prj_1"
      updateDefaults={updateDefaults}
    />,
  );
  return { previewCron, updateDefaults };
}

describe("TrackingDefaultsCard", () => {
  beforeEach(() => {
    vi.spyOn(Intl, "supportedValuesOf").mockReturnValue(["Europe/Warsaw", "UTC"]);
  });

  it("shows the stored timezone for Monthly but hides the cron expression", () => {
    renderCard();

    expect(screen.getByRole("button", { name: "Timezone" })).toHaveTextContent("Europe/Warsaw");
    expect(screen.queryByLabelText("Cron expression")).not.toBeInTheDocument();
  });

  it("renders the timezone menu, current timezone, and helper copy for a daily fixture", () => {
    renderCard({
      schedule: { ...defaults.schedule, frequency: "daily" },
    });

    expect(screen.getByRole("button", { name: "Timezone" })).toHaveTextContent("Europe/Warsaw");
    expect(
      screen.getByText("Anchors all check schedules to the selected local clock."),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("Cron expression")).not.toBeInTheDocument();
  });

  it("marks the card dirty and submits the selected timezone when the menu changes", async () => {
    const { updateDefaults } = renderCard({
      schedule: { ...defaults.schedule, frequency: "daily" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Timezone" }));
    fireEvent.click(screen.getByRole("menuitem", { name: /UTC/ }));

    expect(screen.getByRole("button", { name: "Save" })).not.toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(updateDefaults).toHaveBeenCalledTimes(1));
    expect(updateDefaults).toHaveBeenCalledWith(expect.objectContaining({ timezone: "UTC" }));
  });

  it("surfaces an invalid stored timezone before save and does not submit it", async () => {
    const { updateDefaults } = renderCard({
      schedule: { ...defaults.schedule, timezone: "Etc/GMT+5" },
    });

    const timezone = screen.getByRole("button", { name: "Timezone" });
    expect(screen.getByRole("alert")).toHaveTextContent("Select a valid time zone.");
    expect(timezone).toHaveAttribute("aria-invalid", "true");
    expect(timezone).toHaveAttribute(
      "aria-describedby",
      "tracking-timezone-help tracking-timezone-error",
    );

    fireEvent.click(screen.getByRole("button", { name: "Frequency" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Daily" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Select a valid time zone.")).toBeInTheDocument();
    expect(updateDefaults).not.toHaveBeenCalled();
  });

  it("labels Custom cron times as anchors before deterministic dispatcher jitter", () => {
    renderCard({
      schedule: {
        ...defaults.schedule,
        cron_expression: "0 6 * * *",
        frequency: "custom_cron",
      },
    });

    expect(screen.getByLabelText("Cron expression")).toHaveValue("0 6 * * *");
    expect(screen.getByText("Aug 10, 06:00")).toBeInTheDocument();
    expect(screen.getByText("Aug 11, 06:00")).toBeInTheDocument();
    expect(screen.getByText("Aug 12, 06:00")).toBeInTheDocument();
    expect(screen.getByText("Next three cron anchors")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Each keyword is scheduled at or after an anchor using deterministic jitter.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText("Next three runs")).not.toBeInTheDocument();
    expect(screen.queryByText(/cost\/check/i)).not.toBeInTheDocument();
  });

  it("warns when depth is lowered and submits through the injected audited action", async () => {
    const { updateDefaults } = renderCard();

    fireEvent.click(screen.getByRole("button", { name: "Default SERP depth" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Top 20" }));

    expect(screen.getByText(/ranking past 20/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(updateDefaults).toHaveBeenCalledTimes(1));
    expect(updateDefaults).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: "prj_1", serpDepth: 20, timezone: "Europe/Warsaw" }),
    );
  });
});
