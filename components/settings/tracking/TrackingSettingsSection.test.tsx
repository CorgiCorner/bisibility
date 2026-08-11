import { TrackingSettingsSection } from "@/components/settings/tracking/TrackingSettingsSection";
import type { DefaultsData } from "@/lib/settings/options";
import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  contentProps: undefined as unknown,
  previewProjectCronRuns: vi.fn(),
  updateDefaultRankCheckSettings: vi.fn(),
}));

vi.mock("@/components/settings/tracking/TrackingSettingsContent", () => ({
  TrackingSettingsContent: (props: unknown) => {
    mocks.contentProps = props;
    return <div data-tracking-content-test="" />;
  },
}));
vi.mock("@/lib/actions/settings-cron-preview", () => ({
  previewProjectCronRuns: mocks.previewProjectCronRuns,
}));
vi.mock("@/lib/actions/settings", () => ({
  updateDefaultRankCheckSettings: mocks.updateDefaultRankCheckSettings,
}));

const defaults: DefaultsData = {
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
    cron_expression: "0 6 * * *",
    frequency: "custom_cron",
    jitter_minutes: 60,
    last_checked_at: null,
    next_check_at: null,
    timezone: "Europe/Warsaw",
  },
  serpDepth: 100,
  serpStopOnMatch: true,
  targetUrlCount: 2,
};

describe("TrackingSettingsSection", () => {
  it("wires the audited defaults action and the authorized B1 preview", async () => {
    const preview = { message: "Ready", runs: ["one", "two", "three"], status: "ready" };
    mocks.previewProjectCronRuns.mockResolvedValue(preview);
    render(
      await TrackingSettingsSection({
        canEdit: true,
        defaults,
        domain: "example.com",
        projectId: "prj_1",
      }),
    );

    expect(mocks.previewProjectCronRuns).toHaveBeenCalledWith({
      cronExpression: "0 6 * * *",
      projectId: "prj_1",
      timezone: "Europe/Warsaw",
    });
    expect(mocks.contentProps).toEqual(
      expect.objectContaining({
        initialCronPreview: preview,
        previewCron: mocks.previewProjectCronRuns,
        updateDefaults: mocks.updateDefaultRankCheckSettings,
      }),
    );
  });
});
