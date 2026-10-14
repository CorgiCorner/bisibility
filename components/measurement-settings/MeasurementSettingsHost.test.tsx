import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const calls = vi.hoisted(() => ({
  read: vi.fn(),
  preview: vi.fn(),
  launch: vi.fn(),
  schedule: vi.fn(),
  intent: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock("@/lib/actions/measurement-settings-host", () => ({
  readMeasurementSettingsAction: calls.read,
  previewMeasurementSettingsAction: calls.preview,
  launchMeasurementSettingsAction: calls.launch,
  saveMeasurementScheduleAction: calls.schedule,
  saveMeasurementIntentAction: calls.intent,
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: calls.refresh }) }));
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useFormatter: () => ({ number: String, dateTime: (date: Date) => date.toISOString() }),
}));

import { MeasurementSettingsHost } from "./MeasurementSettingsHost";
import {
  fixtureChoices,
  fixturePermissions,
  fixtureProjectId,
  fixtureSnapshot,
} from "./test-fixtures";

describe("installed Tracking host AUTHORED_NOT_RUN", () => {
  it("renders its server projection with no read initializer, paid operation or settings write", () => {
    render(
      <MeasurementSettingsHost
        projectId={fixtureProjectId}
        initial={{
          kind: "ready",
          snapshot: fixtureSnapshot,
          choices: fixtureChoices,
          permissions: fixturePermissions,
          rateVersion: "synthetic-rate-v1",
          scheduleChoices: [],
        }}
      />,
    );
    expect(screen.getByRole("heading", { name: "title" })).toBeInTheDocument();
    for (const call of [calls.read, calls.preview, calls.launch, calls.schedule, calls.intent])
      expect(call).not.toHaveBeenCalled();
  });
  it("names unconfigured policy and provides the real explicit configuration anchor without enabling a run", () => {
    render(
      <MeasurementSettingsHost
        projectId={fixtureProjectId}
        initial={{
          kind: "unavailable",
          reason: "measurement_policy_unconfigured",
          permissions: {
            canRead: true,
            canPreview: false,
            canLaunch: false,
            canWriteSchedule: false,
            canWriteIntent: false,
          },
        }}
      />,
    );
    expect(screen.getByRole("link", { name: "recovery.policy" })).toHaveAttribute(
      "href",
      `/app/${fixtureProjectId}/settings/tracking#measurement-policy`,
    );
    expect(calls.launch).not.toHaveBeenCalled();
    expect(calls.intent).not.toHaveBeenCalled();
  });
});
