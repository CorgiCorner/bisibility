import { renderWithProjectRunsMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import { screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { SchedulePlanningNotice, ScheduleSaveConfirmation } from "./SchedulePlanningNotice";
import type { ScheduleListRow } from "./SchedulesList";
import { SchedulesWorkspace } from "./SchedulesWorkspace";

vi.mock("@/lib/actions/ai-tracking", () => ({ mutateAiTrackingAction: vi.fn() }));
vi.mock("./SchedulesList", () => ({ SchedulesList: () => <div /> }));
vi.mock("@/components/ai-tracking/AiScheduleDrawerHost", () => ({
  AiScheduleDrawerHost: () => null,
}));
it("retains a saved confirmation without promising plans for a paused or empty schedule", () => {
  render(<ScheduleSaveConfirmation minutes={15} showPlanningHint={false} />);
  expect(screen.getByRole("status")).toHaveTextContent("Schedule saved.");
  expect(screen.queryByText(/Planned runs/)).toBeNull();
});
it("uses a neutral explanation for an unknown configured interval", () => {
  render(<SchedulePlanningNotice minutes={null} />);
  expect(
    screen.getByText(
      "Planned runs may take a short time to appear in Runs. Checks run at their scheduled times.",
    ),
  ).toBeVisible();
  expect(screen.queryByText(/15/)).toBeNull();
});
it.each([
  { enabled: true, keywordCount: 1, archivedAt: null, status: "current", visible: true },
  { enabled: false, keywordCount: 1, archivedAt: null, status: "current", visible: false },
  { enabled: true, keywordCount: 0, archivedAt: null, status: "current", visible: false },
  { enabled: true, keywordCount: 1, archivedAt: "2026-10-20", status: "archived", visible: false },
])(
  "only shows the persistent list explanation for an enabled current populated schedule: %j",
  ({ status, visible, ...schedule }) => {
    render(
      <SchedulesWorkspace
        ai={null}
        aiTarget={null}
        canManage
        canUpdate
        projectId="prj_a"
        projectRef="prj_a"
        schedules={[
          {
            ...schedule,
            publicId: "sch_a",
            name: "Daily",
            frequency: "daily",
            isDefault: false,
          } as ScheduleListRow,
        ]}
        status={status as "current" | "archived"}
        planningMinutes={15}
      />,
    );
    expect(screen.queryByText(/Planned runs usually appear/) !== null).toBe(visible);
  },
);
