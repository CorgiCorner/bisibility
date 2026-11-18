import { renderWithProjectRunsMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import { aiFixture, rankFixture } from "@/lib/schedules/list.test-fixture";
import { screen, within } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { toAiScheduleListRow } from "./ai-schedule-rows";
import { SchedulesList } from "./SchedulesList";

it("renders the current rank per-run price and leaves AI unpriced in the list", () => {
  render(
    <SchedulesList
      canUpdate={false}
      projectId="prj_one"
      projectRef="prj_one"
      schedules={[rankFixture]}
      ai={{
        canWrite: false,
        activePromptCount: 2,
        rows: [toAiScheduleListRow(aiFixture)],
        onArchive: vi.fn(),
        onPause: vi.fn(),
      }}
    />,
  );
  const table = screen.getByRole("table", { name: "Schedules" });
  expect(within(table).getByText("~$0.24")).toBeVisible();
  const aiRow = within(table).getByText(aiFixture.name).closest('[role="row"]');
  expect(aiRow).not.toBeNull();
  expect(within(aiRow as HTMLElement).getByText("-")).toBeVisible();
  expect(
    within(table)
      .getAllByRole("columnheader")
      .map((cell) => cell.textContent),
  ).toEqual(["Schedule", "Cadence", "Members", "Per run", "Next", "Actions"]);
});
