import { routerMock } from "@/tests/next-navigation";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { type ScheduleListRow, SchedulesList } from "./SchedulesList";

const mocks = vi.hoisted(() => ({ showToast: vi.fn() }));
vi.mock("@/components/ui", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/components/ui")>();
  return { ...actual, useToast: () => ({ showToast: mocks.showToast }) };
});

const schedules: ScheduleListRow[] = [
  {
    cadenceMeta: "Europe/Madrid / starts within 15 min of 06:00",
    enabled: true,
    frequency: "daily",
    isDefault: true,
    keywordCount: 248,
    memberMeta: "2 markets x 1 device",
    name: "Daily 06:00",
    nextRunLabel: "tomorrow 06:00",
    perRunCents: 298,
    publicId: "sch_daily",
    targetCount: 496,
    timeOfDay: "06:00",
    timezone: "Europe/Madrid",
  },
  {
    blocked: true,
    cadenceMeta: "Europe/Madrid / starts within 15 min of 06:00",
    enabled: true,
    frequency: "daily",
    isDefault: false,
    keywordCount: 350,
    memberMeta: "2 markets x 1 device",
    name: "Commercial daily",
    nextRunLabel: "tomorrow 06:00",
    perRunCents: 420,
    publicId: "sch_commercial",
    tagScope: "tag = commercial",
    targetCount: 700,
    timeOfDay: "06:00",
    timezone: "Europe/Madrid",
  },
  {
    cadenceMeta: "Europe/Stockholm / exactly 06:00",
    enabled: false,
    frequency: "weekly",
    isDefault: false,
    keywordCount: 40,
    memberMeta: "2 markets x 1 device",
    name: "Nordics weekly",
    nextRunLabel: "-",
    perRunCents: 48,
    publicId: "sch_nordics",
    tagScope: "tag = nordics",
    targetCount: 80,
    timeOfDay: "06:00",
    timezone: "Europe/Stockholm",
    weekday: "Monday",
  },
  {
    cadenceMeta: "Europe/Madrid / starts within 15 min of 06:00",
    dayOfMonth: "1st",
    enabled: true,
    frequency: "monthly",
    isDefault: false,
    keywordCount: 12,
    memberMeta: "1 market x 1 device",
    name: "Monthly 06:00",
    nextRunLabel: "Mon 06:00",
    perRunCents: 14,
    publicId: "sch_monthly",
    targetCount: 12,
    timeOfDay: "06:00",
    timezone: "Europe/Madrid",
  },
];

function renderList(overrides: Partial<ComponentProps<typeof SchedulesList>> = {}) {
  return render(
    <SchedulesList
      canUpdate
      projectId="prj_story"
      projectRef="prj_story"
      schedules={schedules}
      {...overrides}
    />,
  );
}

describe("SchedulesList", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
  });

  it("renders the Schedule, Cadence, Members, Per run, and Next columns", () => {
    renderList();

    const table = screen.getByRole("table", { name: "Schedules" });
    expect(
      within(table)
        .getAllByRole("columnheader")
        .map((cell) => cell.textContent),
    ).toEqual(["Schedule", "Cadence", "Members", "Per run", "Next", "Actions"]);
    expect(
      within(table).getByText("248 keywords in 2 markets x 1 device = 496 checks a run"),
    ).toBeVisible();
    expect(within(table).getByText("~$2.98")).toBeVisible();
  });

  it("renders scope, cadence, and an estimate without a planned run", () => {
    renderList();

    expect(screen.getByText("tag = commercial")).toBeVisible();
    expect(screen.getByText("tag = nordics")).toBeVisible();
    expect(screen.getByText("Mondays, 06:00")).toBeVisible();
    expect(screen.getByText("Monthly on the 1st, 06:00")).toBeVisible();
    expect(screen.getAllByText("tomorrow 06:00")).toHaveLength(2);
    expect(screen.getByText("Mon 06:00")).toBeVisible();
    const pausedRow = screen.getByRole("row", { name: /Nordics weekly/ });
    expect(within(pausedRow).getByText("Paused")).toBeVisible();
    expect(within(pausedRow).getByText("~$0.48")).toBeVisible();
  });

  it("renders the schedule empty state without the card title", () => {
    renderList({ schedules: [] });

    expect(screen.getByRole("heading", { name: "No schedules yet" })).toBeVisible();
    expect(
      screen.getByText(
        "Keywords are checked only when you launch a run. Create a schedule to check them on a cadence.",
      ),
    ).toBeVisible();
    expect(screen.getByRole("link", { name: "New schedule" })).toBeVisible();
    expect(screen.queryByText("0 schedules")).not.toBeInTheDocument();
    expect(screen.queryByRole("table", { name: "Schedules" })).not.toBeInTheDocument();
  });

  it("shows states only for exceptions", () => {
    renderList();

    expect(screen.getByText("Next run blocked - monthly limit")).toBeVisible();
    expect(screen.getByText("Paused")).toBeVisible();
    expect(screen.queryByText("Enabled")).not.toBeInTheDocument();
  });

  it("opens the editor when a row is clicked", () => {
    renderList();

    fireEvent.click(screen.getByRole("row", { name: /Daily 06:00/ }));

    expect(routerMock.push).toHaveBeenCalledWith("/app/prj_story/rank-tracker/schedules/sch_daily");
  });

  it("opens the schedule link with Tab and Enter", async () => {
    const user = userEvent.setup();
    renderList();

    await user.tab();
    await user.tab();
    const link = screen.getByRole("link", { name: "Daily 06:00" });
    expect(link).toHaveFocus();
    expect(link).toHaveAttribute("href", "/app/prj_story/rank-tracker/schedules/sch_daily");

    const click = vi.fn((event: MouseEvent) => event.preventDefault());
    link.addEventListener("click", click);
    await user.keyboard("{Enter}");
    link.removeEventListener("click", click);

    expect(click).toHaveBeenCalledOnce();
  });

  it("offers inline Pause and Resume controls", async () => {
    renderList();

    fireEvent.click(screen.getByRole("button", { name: "Pause Daily 06:00" }));
    await waitFor(() => expect(routerMock.refresh).toHaveBeenCalledOnce());
    expect(fetch).toHaveBeenCalledWith("/api/check-schedules/sch_daily", {
      body: JSON.stringify({ enabled: false, projectId: "prj_story" }),
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      method: "PATCH",
    });
    expect(routerMock.push).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Pause Daily 06:00" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Resume Nordics weekly" })).toBeVisible();
  });

  it("toasts when pausing a schedule fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    renderList();

    fireEvent.click(screen.getByRole("button", { name: "Pause Daily 06:00" }));

    await waitFor(() =>
      expect(mocks.showToast).toHaveBeenCalledWith(
        "Could not update the schedule. Please try again.",
        {
          severity: "error",
        },
      ),
    );
    expect(routerMock.refresh).not.toHaveBeenCalled();
  });
});
