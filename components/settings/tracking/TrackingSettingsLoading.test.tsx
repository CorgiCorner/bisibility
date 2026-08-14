import { TrackingSettingsContent } from "@/components/settings/tracking/TrackingSettingsContent";
import { TrackingSettingsLoading } from "@/components/settings/tracking/TrackingSettingsLoading";
import { trackingCardGeometryClassNames } from "@/components/settings/tracking/tracking-settings-layout";
import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const defaults = {
  city: null,
  costPerCheck: 0.01,
  country: "Poland",
  device: "Desktop",
  deviceCount: 1,
  inspectionDailyLimit: 100,
  keywordCount: 3,
  locationCount: 1,
  locationKey: "PL",
  locationLabel: "Poland",
  schedule: {
    cron_expression: null,
    frequency: "daily" as const,
    jitter_minutes: 60,
    last_checked_at: null,
    next_check_at: null,
    timezone: "Europe/Warsaw",
  },
  serpDepth: 100 as const,
  serpStopOnMatch: true,
  targetUrlCount: 2,
};

describe("TrackingSettingsLoading", () => {
  it("uses the tracked-markets column width for settled and loading content", () => {
    const { container } = render(
      <>
        <TrackingSettingsContent
          canEdit
          defaults={defaults}
          domain="example.com"
          initialCronPreview={{ message: "", runs: [], status: "idle" }}
          previewCron={vi.fn()}
          projectId="prj_1"
          updateDefaults={vi.fn()}
        />
        <TrackingSettingsLoading />
      </>,
    );

    for (const selector of [
      "[data-tracking-settings-content]",
      "[data-tracking-settings-loading]",
    ]) {
      const column = container.querySelector(selector);
      expect(column).toHaveClass("max-w-[760px]");
      expect(column).not.toHaveClass("max-w-[640px]");
    }
  });

  it("shares every settled card geometry class", () => {
    const { container } = render(
      <>
        <TrackingSettingsContent
          canEdit
          defaults={defaults}
          domain="example.com"
          initialCronPreview={{ message: "", runs: [], status: "idle" }}
          previewCron={vi.fn()}
          projectId="prj_1"
          updateDefaults={vi.fn()}
        />
        <TrackingSettingsLoading />
      </>,
    );

    for (const [name, className] of Object.entries(trackingCardGeometryClassNames)) {
      const settled = container.querySelector(
        `[data-tracking-settled-frame="${name}"] [data-settings-card]`,
      );
      const loading = container.querySelector(`[data-tracking-loading-frame="${name}"]`);
      expect(settled).toHaveClass(...className.split(" "));
      expect(loading).toHaveClass(...className.split(" "));
    }
  });
});
