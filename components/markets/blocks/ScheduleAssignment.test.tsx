import {
  ScheduleAssignment,
  type ScheduleAssignmentProps,
} from "@/components/markets/blocks/ScheduleAssignment";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

const schedules = [
  { costPerCheckCents: 50, id: "daily", name: "Daily", frequency: "daily" },
  { costPerCheckCents: 0, id: "manual", name: "Manual", frequency: "manual" },
] as const;

function props(overrides: Partial<ScheduleAssignmentProps> = {}): ScheduleAssignmentProps {
  return {
    fixed: 1,
    keywordCount: 1,
    onChange: vi.fn(),
    schedules,
    selectedId: "daily",
    ...overrides,
  };
}

describe("ScheduleAssignment", () => {
  it("selects trusted schedules and offers creation next to the schedule label", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const onNewSchedule = vi.fn();
    const { rerender } = render(<ScheduleAssignment {...props({ onChange, onNewSchedule })} />);

    await user.click(screen.getByRole("button", { name: "Schedule" }));
    await user.click(screen.getByRole("menuitem", { name: "Manual" }));
    expect(onChange).toHaveBeenCalledWith(null);
    rerender(<ScheduleAssignment {...props({ onChange, onNewSchedule, selectedId: null })} />);
    expect(screen.getByText(/Checks run only when you start them/)).toBeVisible();
    await user.click(screen.getByRole("button", { name: "New schedule" }));
    expect(onNewSchedule).toHaveBeenCalledOnce();
  });

  it("uses fixed rows rather than independent fixture dimensions", () => {
    render(<ScheduleAssignment {...props({ fixed: 1 })} />);
    expect(screen.getByText(/1 keyword · 1 check/)).toBeVisible();
    expect(screen.queryByText("4 checks")).not.toBeInTheDocument();
  });

  it("counts keywords and checks separately because a row is not a keyword", () => {
    render(<ScheduleAssignment {...props({ fixed: 4, keywordCount: 2 })} />);

    expect(screen.getByText("2 keywords · 4 checks per run.")).toBeVisible();
  });

  it("says nothing about price when the cost per check is unknown", () => {
    render(
      <ScheduleAssignment
        {...props({
          fixed: 4,
          keywordCount: 2,
          schedules: [{ costPerCheckCents: null, frequency: "daily", id: "daily", name: "Daily" }],
        })}
      />,
    );

    expect(screen.getByText("2 keywords · 4 checks per run.")).toBeVisible();
    expect(screen.queryByText(/\$/)).not.toBeInTheDocument();
  });

  it("reports stale schedules but does not validate an empty keyword form prematurely", () => {
    const { rerender } = render(<ScheduleAssignment {...props({ selectedId: "gone" })} />);
    expect(screen.getByRole("alert")).toHaveTextContent("no longer available");
    rerender(<ScheduleAssignment {...props({ fixed: 0, keywordCount: 0 })} />);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByText("New keywords will join this schedule.")).toBeVisible();
  });
});
