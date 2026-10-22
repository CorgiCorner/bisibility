import { renderWithProjectRunsMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import { fireEvent, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { UnscheduledKeywordsNotice } from "./UnscheduledKeywordsNotice";

const candidates = [
  {
    publicId: "kw_unassigned",
    name: "test",
    market: "Poland",
    device: "Desktop",
    tags: [],
    scheduleId: null,
    targetCount: 1,
  },
];
afterEach(() => vi.unstubAllGlobals());
it("counts unscheduled keywords and requires explicit drawer selection before assignment", () => {
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  render(
    <UnscheduledKeywordsNotice
      canEdit
      candidates={candidates}
      schedules={[{ publicId: "sch_default", name: "Daily", enabled: true, isDefault: true }]}
      projectId="prj_example"
    />,
  );
  expect(screen.getByText("1 keyword has no schedule.")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Add to schedule" }));
  expect(screen.getByRole("dialog")).toBeVisible();
  expect(fetch).not.toHaveBeenCalled();
});
it("does not offer assignment to readers", () => {
  render(
    <UnscheduledKeywordsNotice
      canEdit={false}
      candidates={candidates}
      schedules={[{ publicId: "sch_default", name: "Daily", enabled: true, isDefault: true }]}
      projectId="prj_example"
    />,
  );
  expect(screen.queryByRole("button", { name: "Add to schedule" })).toBeNull();
});

it("does not offer assignment to a paused default", () => {
  render(
    <UnscheduledKeywordsNotice
      canEdit
      candidates={candidates}
      schedules={[{ publicId: "sch_default", name: "Daily", enabled: false, isDefault: true }]}
      projectId="prj_example"
    />,
  );
  expect(screen.queryByRole("button", { name: "Add to schedule" })).toBeNull();
});

it("offers another enabled schedule when the default is paused", async () => {
  const fetch = vi.fn().mockResolvedValue({ ok: true });
  vi.stubGlobal("fetch", fetch);
  render(
    <UnscheduledKeywordsNotice
      canEdit
      candidates={candidates}
      projectId="prj_example"
      schedules={[
        { publicId: "sch_default", name: "Paused daily", enabled: false, isDefault: true },
        { publicId: "sch_weekly", name: "Weekly", enabled: true, isDefault: false },
      ]}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Add to schedule" }));
  expect(screen.getByRole("button", { name: "Schedule" })).toHaveTextContent("Weekly");
  expect(fetch).not.toHaveBeenCalled();
});
it("keeps an informative count without offering assignment when no schedules are enabled", () => {
  render(
    <UnscheduledKeywordsNotice
      canEdit
      candidates={candidates}
      schedules={[]}
      projectId="prj_example"
    />,
  );
  expect(screen.getByText("1 keyword has no schedule.")).toBeVisible();
  expect(screen.queryByRole("button", { name: "Add to schedule" })).toBeNull();
});
