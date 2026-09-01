import { DataSourcesSettingsContent } from "@/components/settings/data-sources/DataSourcesSettingsContent";
import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/settings/tracking/UrlInspectionCard", () => ({
  UrlInspectionCard: () => <div />,
}));
vi.mock("@/components/settings/tracking/SearchDataSyncCard", () => ({
  SearchDataSyncCard: () => <div />,
}));
const defaults = {
  city: null,
  costPerCheck: 0,
  country: "US",
  device: "Desktop",
  deviceCount: 1,
  inspectionDailyLimit: 100,
  keywordCount: 1,
  locationCount: 1,
  locationKey: "US",
  locationLabel: "United States",
  schedule: {
    cron_expression: null,
    frequency: "manual" as const,
    jitter_minutes: 0,
    last_checked_at: null,
    next_check_at: null,
    timezone: "UTC",
  },
  serpDepth: 100 as const,
  serpStopOnMatch: true,
  targetUrlCount: 1,
};
describe("DataSourcesSettingsContent", () => {
  it("owns both Search Console policy cards", () => {
    const { container } = render(
      <DataSourcesSettingsContent canEdit defaults={defaults} projectId="prj_1" />,
    );
    expect(container.querySelector('[data-testid="url-inspection-card"]')).toBeInTheDocument();
    expect(container.querySelector('[data-testid="search-data-sync-card"]')).toBeInTheDocument();
  });
});
