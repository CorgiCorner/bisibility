import { TrackingDefaultsCard } from "@/components/settings/tracking/TrackingDefaultsCard";
import {
  renderWithTrackingSettingsMessages as render,
  renderWithFeatureMessages,
  trackingSettingsFeatureTestMessages,
} from "@/i18n/test-support/render-with-feature-messages";
import type { DefaultsData } from "@/lib/settings/options";
import { reviewedDefaultsPreview } from "@/lib/settings/reviewed-defaults.test-fixture";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

const polishTrackingMessages = {
  ...trackingSettingsFeatureTestMessages,
  projectSettingsTracking: {
    ...trackingSettingsFeatureTestMessages.projectSettingsTracking,
    checkDefaults: {
      ...trackingSettingsFeatureTestMessages.projectSettingsTracking.checkDefaults,
      previewInvalid: "Nie można odczytać wyrażenia cron.",
      previewReady: "Każde słowo kluczowe jest planowane po kotwicy.",
      previewTitle: "Następne kotwice cron",
      readOnly: "Tylko do odczytu",
      timezoneInvalid: "Wybierz prawidłową strefę czasową.",
    },
  },
};

function renderCard(overrides: Partial<DefaultsData> = {}) {
  const updateDefaults = vi.fn(async () => ({ kind: "saved" }));
  render(
    <TrackingDefaultsCard
      canEdit
      defaults={{ ...defaults, ...overrides }}
      previewDefaults={reviewedDefaultsPreview}
      projectId="prj_1"
      updateDefaults={updateDefaults}
    />,
  );
  return { updateDefaults };
}

describe("TrackingDefaultsCard", () => {
  beforeEach(() => {
    vi.spyOn(Intl, "supportedValuesOf").mockReturnValue(["Europe/Warsaw", "UTC"]);
  });

  it.each(["daily", "monthly", "custom_cron"] as const)(
    "does not offer schedule controls for %s defaults",
    (frequency) => {
      renderCard({ schedule: { ...defaults.schedule, frequency, cron_expression: "0 6 * * *" } });
      expect(screen.queryByRole("button", { name: "Frequency" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Timezone" })).not.toBeInTheDocument();
      expect(screen.queryByLabelText("Cron expression")).not.toBeInTheDocument();
      expect(screen.queryByText("Next three cron anchors")).not.toBeInTheDocument();
    },
  );

  it.each([
    { ...defaults.schedule, frequency: "monthly" as const },
    { ...defaults.schedule, frequency: "custom_cron" as const, cron_expression: "15 7 * * 1" },
    { ...defaults.schedule, frequency: "manual" as const },
  ])("saves check depth while preserving stored cadence $frequency", async (schedule) => {
    const { updateDefaults } = renderCard({ schedule });

    fireEvent.click(screen.getByRole("button", { name: "Default SERP depth" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Top 20" }));

    expect(screen.getByText(/ranking past 20/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Review changes" }));

    expect(updateDefaults).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole("checkbox", { name: /reviewed these exact/i }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm reviewed save" }));
    await waitFor(() => expect(updateDefaults).toHaveBeenCalledTimes(1));
    expect(updateDefaults).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: "prj_1",
        serpDepth: 20,
        timezone: "Europe/Warsaw",
        frequency: schedule.frequency,
        cronExpression: schedule.cron_expression,
        jitterMinutes: schedule.jitter_minutes,
      }),
      expect.objectContaining({ confirmed: true }),
    );
  });

  it.each([
    [true, "Full search results", false, /may use more credits or provider requests/i],
    [false, "My position", true, /competitor results may be incomplete/i],
  ] as const)(
    "reviews collection mode without launching a check (%s)",
    async (initial, label, expected, help) => {
      const { updateDefaults } = renderCard({ serpStopOnMatch: initial });
      expect(screen.queryByRole("switch", { name: /first domain match/i })).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Results to collect" }));
      fireEvent.click(screen.getByRole("menuitem", { name: label }));
      expect(screen.getByText(help)).toBeVisible();
      expect(updateDefaults).not.toHaveBeenCalled();
      fireEvent.click(screen.getByRole("button", { name: "Review changes" }));
      fireEvent.click(await screen.findByRole("checkbox", { name: /reviewed these exact/i }));
      fireEvent.click(screen.getByRole("button", { name: "Confirm reviewed save" }));
      await waitFor(() =>
        expect(updateDefaults).toHaveBeenCalledWith(
          expect.objectContaining({ serpStopOnMatch: expected }),
          expect.objectContaining({ confirmed: true }),
        ),
      );
    },
  );

  it("always displays full collection at Top 20 despite a retained early-stop preference", () => {
    renderCard({ serpDepth: 20, serpStopOnMatch: true });
    expect(screen.getByRole("button", { name: "Results to collect" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Results to collect" })).toHaveTextContent(
      "Full search results",
    );
    expect(
      screen.getByText(/Collects the requested Top 20 even when your site is found early/),
    ).toBeVisible();
  });

  it("shows Top-10 Visibility guidance inline and on hover", async () => {
    renderCard({ serpDepth: 10 });
    expect(screen.getByRole("status")).toHaveTextContent(
      "Checks below Top 20 do not update Visibility.",
    );

    expect(screen.getByRole("button", { name: "Default SERP depth" })).toHaveAccessibleDescription(
      "Top 10 checks do not update Visibility. Affected keywords still count toward its coverage total.",
    );
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    await userEvent.setup().hover(screen.getByRole("button", { name: "Default SERP depth" }));
    expect(await screen.findByRole("tooltip")).toHaveTextContent(
      "Top 10 checks do not update Visibility",
    );
  });

  it("shows check defaults as text for a read-only viewer", () => {
    render(
      <TrackingDefaultsCard
        canEdit={false}
        defaults={defaults}
        previewDefaults={reviewedDefaultsPreview}
        projectId="prj_1"
        updateDefaults={vi.fn(async () => ({}))}
      />,
    );

    expect(screen.getByText("Read-only")).toBeInTheDocument();
    expect(screen.queryByText("Monthly")).not.toBeInTheDocument();
    expect(screen.queryByText("Europe/Warsaw")).not.toBeInTheDocument();
    expect(screen.getByText("Top 100")).toBeInTheDocument();
    expect(screen.getByText("Desktop")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Review changes" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Timezone" })).not.toBeInTheDocument();
  });

  it("localizes the read-only capability state", () => {
    renderWithFeatureMessages(
      <TrackingDefaultsCard
        canEdit={false}
        defaults={defaults}
        previewDefaults={reviewedDefaultsPreview}
        projectId="prj_1"
        updateDefaults={vi.fn(async () => ({}))}
      />,
      { locale: "pl", messages: polishTrackingMessages },
    );

    expect(screen.getByText("Tylko do odczytu")).toBeInTheDocument();
  });
});
