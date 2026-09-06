import { render, screen } from "@testing-library/react";
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
});
