import { sharedMessages as messages } from "@/i18n/core-messages";
import type { MonitorDetail } from "@/lib/local-monitors/contracts";
import { render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";
import { MonitorCapturedScope } from "./MonitorCapturedScope";
import { monitorUiFixture } from "./monitor-ui.test-fixture";

function renderScope(monitor: MonitorDetail) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <MonitorCapturedScope monitor={monitor} />
    </NextIntlClientProvider>,
  );
}
function value(label: string) {
  return screen.getByText(label, { selector: "dt" }).nextElementSibling;
}
describe("retained monitor scope", () => {
  it("shows the exact saved axes and calendar without treating them as execution", () => {
    renderScope({
      ...monitorUiFixture,
      axes: {
        ...monitorUiFixture.axes,
        operatingSystem: "android",
        zoom: 14,
        language: "pl",
        cutoff: 50,
      },
      schedule: {
        ...monitorUiFixture.schedule,
        mode: "scheduled",
        calendar: {
          id: "sch_abcdefghijklmnopqrstuvwx",
          measurementEpoch: "7",
          frequency: "custom_cron",
          cronExpression: "0 10 * * 1",
          timeOfDay: null,
          timezone: "Europe/Warsaw",
          jitterMinutes: 5,
          configuredSerpDepth: 100,
          configuredProviderPolicy: "saved-provider-policy",
        },
      },
    });
    expect(value("Business location reference")).toHaveTextContent(monitorUiFixture.locationId);
    expect(value("Location identity revision")).toHaveTextContent(
      monitorUiFixture.identityRevisionId,
    );
    expect(value("Operating system")).toHaveTextContent("android");
    expect(value("Map zoom")).toHaveTextContent("14");
    expect(value("Search language code")).toHaveTextContent("pl");
    expect(value("Maximum results per point")).toHaveTextContent("50");
    expect(value("Calendar version")).toHaveTextContent("7");
    expect(value("Cron expression")).toHaveTextContent("0 10 * * 1");
    expect(value("Calendar timezone")).toHaveTextContent("Europe/Warsaw");
    expect(value("Configured calendar depth")).toHaveTextContent("100");
    expect(value("Configured provider policy")).toHaveTextContent("saved-provider-policy");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
  it("distinguishes unrestricted axes and a missing calendar", () => {
    renderScope({
      ...monitorUiFixture,
      axes: { ...monitorUiFixture.axes, operatingSystem: null, zoom: null },
    });
    expect(value("Operating system")).toHaveTextContent("Unrestricted");
    expect(value("Map zoom")).toHaveTextContent("Unrestricted");
    expect(screen.getByText("No calendar is saved for this intent.")).toBeInTheDocument();
    expect(
      within(screen.getByRole("region", { name: "Saved measurement scope" })).queryByRole("button"),
    ).not.toBeInTheDocument();
  });
});
