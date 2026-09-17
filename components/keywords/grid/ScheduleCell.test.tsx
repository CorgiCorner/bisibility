import {
  projectRankTrackerFeatureTestMessages,
  renderWithProjectRankTrackerMessages as render,
  renderWithFeatureMessages,
} from "@/i18n/test-support/render-with-feature-messages";
import { screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { describe, expect, it } from "vitest";
import { ScheduleCell, type ScheduleCellTarget } from "./ScheduleCell";

const daily = { name: "Daily 06:00", publicId: "sch_daily" };
const weekly = { name: "Weekly Mon", publicId: "sch_weekly" };

function textContent(expected: string) {
  return (_content: string, element: Element | null) => element?.textContent === expected;
}

function target(overrides: Partial<ScheduleCellTarget>): ScheduleCellTarget {
  return {
    device: "Desktop",
    id: "kw_a00000000000000000000000",
    location: "Spain / Spanish",
    schedule: daily,
    ...overrides,
  };
}

function renderPolish(ui: ReactElement) {
  const messages = structuredClone(projectRankTrackerFeatureTestMessages);
  messages.projectRankTracker.list.scheduleManual = "Recznie";
  messages.projectRankTracker.list.scheduleMixed = "Mieszane - {count, number}";
  return renderWithFeatureMessages(ui, { locale: "pl", messages });
}

describe("ScheduleCell", () => {
  it("shows the target schedule name", () => {
    render(<ScheduleCell targets={[target({})]} />);

    expect(screen.getByText("Daily 06:00")).toBeVisible();
  });

  it("writes Manual explicitly for an unscheduled target", () => {
    render(<ScheduleCell targets={[target({ schedule: null })]} />);

    expect(screen.getByText("Manual")).toBeVisible();
  });

  it("renders Mixed - N with a target schedule tooltip", () => {
    render(
      <ScheduleCell
        targets={[
          target({}),
          target({
            device: "Mobile",
            id: "kw_b00000000000000000000000",
            schedule: weekly,
          }),
          target({ id: "kw_c00000000000000000000000" }),
        ]}
      />,
    );

    const mixed = screen.getByText("Mixed - 2");
    expect(mixed).toHaveAttribute("aria-describedby");
    expect(
      screen.getAllByText(textContent("Spain / Spanish / Desktop - Daily 06:00")),
    ).toHaveLength(2);
    expect(
      screen.getByText(textContent("Spain / Spanish / Mobile - Weekly Mon")),
    ).toBeInTheDocument();
  });

  it("localizes manual and mixed facts without translating user-authored schedule names", () => {
    const { rerender } = renderPolish(<ScheduleCell targets={[target({ schedule: null })]} />);

    expect(screen.getByText("Recznie")).toBeVisible();
    expect(screen.queryByText("Manual")).toBeNull();

    rerender(<ScheduleCell targets={[target({})]} />);
    expect(screen.getByText("Daily 06:00")).toBeVisible();

    rerender(
      <ScheduleCell
        targets={[
          target({}),
          target({
            device: "Mobile",
            id: "kw_b00000000000000000000000",
            schedule: weekly,
          }),
          target({ id: "kw_c00000000000000000000000", schedule: null }),
        ]}
      />,
    );

    const mixed = screen.getByText("Mieszane - 3");
    expect(mixed).toHaveAttribute("aria-describedby");
    expect(screen.getByText(textContent("Spain / Spanish / Desktop - Daily 06:00"))).toBeVisible();
    expect(screen.getByText(textContent("Spain / Spanish / Mobile - Weekly Mon"))).toBeVisible();
    expect(screen.getByText(textContent("Spain / Spanish / Desktop - Recznie"))).toBeVisible();
    expect(screen.queryByText("Mixed - 3")).toBeNull();
    expect(screen.queryByText("Manual")).toBeNull();
  });
});
