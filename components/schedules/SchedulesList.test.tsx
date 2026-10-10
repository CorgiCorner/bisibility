import { renderWithProjectRunsMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import { routerMock } from "@/tests/next-navigation";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type ScheduleListRow, SchedulesList } from "./SchedulesList";

const mocks = vi.hoisted(() => ({ showToast: vi.fn() }));
vi.mock("@/components/ui/toast-context", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/components/ui/toast-context")>()),
  useToast: () => ({ showToast: mocks.showToast }),
}));

const schedules: ScheduleListRow[] = [
  {
    enabled: true,
    frequency: "daily",
    isDefault: true,
    keywordCount: 248,
    memberDeviceCount: 1,
    memberMarketCount: 2,
    name: "Daily 06:00",
    nextRunAt: "2026-09-02T04:00:00.000Z",
    perRunCents: 298,
    publicId: "sch_daily",
    targetCount: 496,
    timeOfDay: "06:00",
    timezone: "Europe/Madrid",
  },
  {
    blocked: true,
    enabled: true,
    frequency: "daily",
    isDefault: false,
    keywordCount: 350,
    memberDeviceCount: 1,
    memberMarketCount: 2,
    name: "Commercial daily",
    nextRunAt: "2026-09-02T04:00:00.000Z",
    perRunCents: 420,
    publicId: "sch_commercial",
    sharedTag: "commercial",
    targetCount: 700,
    timeOfDay: "06:00",
    timezone: "Europe/Madrid",
  },
  {
    enabled: false,
    frequency: "weekly",
    isDefault: false,
    keywordCount: 40,
    memberDeviceCount: 1,
    memberMarketCount: 2,
    name: "Nordics weekly",
    nextRunAt: "2026-09-07T04:00:00.000Z",
    perRunCents: 48,
    publicId: "sch_nordics",
    sharedTag: "nordics",
    targetCount: 80,
    timeOfDay: "06:00",
    timezone: "Europe/Stockholm",
    weekday: "Monday",
  },
  {
    dayOfMonth: 1,
    enabled: true,
    frequency: "monthly",
    isDefault: false,
    keywordCount: 12,
    memberDeviceCount: 1,
    memberMarketCount: 1,
    name: "Monthly 06:00",
    nextRunAt: "2026-09-07T04:00:00.000Z",
    perRunCents: 14,
    publicId: "sch_monthly",
    targetCount: 12,
    timeOfDay: "06:00",
    timezone: "Europe/Madrid",
  },
];

const resizeColumnLabels = ["Schedule", "Cadence", "Members", "Per run", "Next"] as const;

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

async function tabPastScheduleResizeControls(user: ReturnType<typeof userEvent.setup>) {
  await user.tab();
  expect(screen.getByRole("button", { name: "Schedule status" })).toHaveFocus();
  await user.tab();
  expect(screen.getByRole("link", { name: "New schedule" })).toHaveFocus();

  for (const label of resizeColumnLabels) {
    await user.tab();
    expect(screen.getByRole("separator", { name: `Resize ${label} column` })).toHaveFocus();
  }
}

describe("SchedulesList", () => {
  it("keeps an empty schedule accessible and explains why it has no next check", () => {
    renderList({
      schedules: [{ ...schedules[0], assignedKeywordCount: 0, keywordCount: 0, targetCount: 0 }],
    });
    expect(screen.getByText("Empty · settings saved")).toBeVisible();
    expect(screen.getByText("Add keywords to start")).toBeVisible();
    expect(screen.getByRole("link", { name: "Daily 06:00" })).toHaveAttribute(
      "href",
      "/app/prj_story/runs/schedules/sch_daily",
    );
  });

  it("does not label a schedule with inactive assigned targets as empty", () => {
    renderList({
      schedules: [{ ...schedules[0], assignedKeywordCount: 2, keywordCount: 0, targetCount: 0 }],
    });
    expect(screen.queryByText("Empty · settings saved")).toBeNull();
  });

  afterEach(() => vi.useRealTimers());

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
  });

  it("renders the Schedule, Cadence, Members, Per run, and Next columns", () => {
    renderList();

    expect(screen.getByRole("heading", { name: "4 schedules" }).closest("header")).not.toHaveClass(
      "border-b",
    );
    const table = screen.getByRole("table", { name: "Schedules" });
    expect(table.querySelector('[role="rowgroup"] > [role="row"]')).toHaveClass(
      "border-y",
      "border-border",
    );
    expect(
      within(table)
        .getAllByRole("columnheader")
        .map((cell) => cell.textContent),
    ).toEqual(["Schedule", "Cadence", "Members", "Per run", "Next", "Actions"]);
    expect(within(table).getByText("248 keywords = 496 checks a run")).toBeVisible();
    expect(within(table).getAllByText("2 markets x 1 device")).toHaveLength(3);
    expect(within(table).getByText("~$2.98")).toBeVisible();
  });

  it("renders scope, cadence, and an estimate without a planned run", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-01T12:00:00.000Z"));
    renderList();

    expect(screen.getByText("tag = commercial")).toBeVisible();
    expect(screen.getByText("tag = nordics")).toBeVisible();
    expect(screen.getByText("Monday, 06:00")).toBeVisible();
    expect(screen.getByText("Monthly on the 1st, 06:00")).toBeVisible();
    expect(screen.getAllByText("tomorrow 06:00")).toHaveLength(2);
    expect(screen.getByText("Mon 06:00")).toBeVisible();
    const pausedRow = screen.getByRole("row", { name: /Nordics weekly/ });
    expect(within(pausedRow).getByText("Paused")).toBeVisible();
    expect(within(pausedRow).getByText("~$0.48")).toBeVisible();
  });

  it("keeps the status filter available in the empty state", () => {
    renderList({ schedules: [] });

    expect(screen.getByRole("heading", { name: "No schedules yet" })).toBeVisible();
    expect(
      screen.getByText(
        "Keywords are checked only when you launch a run. Create a schedule to check them on a cadence.",
      ),
    ).toBeVisible();
    expect(screen.getByRole("link", { name: "New schedule" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Schedule status" })).toBeVisible();
    expect(screen.queryByRole("table", { name: "Schedules" })).not.toBeInTheDocument();
  });

  it("hides New schedule when the viewer cannot create one", () => {
    renderList({ canUpdate: false, schedules: [] });

    expect(screen.queryByRole("link", { name: "New schedule" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Schedule status" })).toBeVisible();
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

    expect(routerMock.push).toHaveBeenCalledWith("/app/prj_story/runs/schedules/sch_daily");
  });

  it("opens the editor when a row is activated with the keyboard", async () => {
    const user = userEvent.setup();
    renderList();

    await tabPastScheduleResizeControls(user);
    const row = screen.getByRole("row", { name: /Daily 06:00/ });
    await user.tab();
    expect(row).toHaveFocus();

    await user.keyboard("{Enter}");

    expect(routerMock.push).toHaveBeenCalledWith("/app/prj_story/runs/schedules/sch_daily");
  });

  it("opens the schedule link with Tab and Enter without triggering the row callback", async () => {
    const user = userEvent.setup();
    renderList();

    await tabPastScheduleResizeControls(user);
    const row = screen.getByRole("row", { name: /Daily 06:00/ });
    await user.tab();
    expect(row).toHaveFocus();

    await user.tab();
    const link = screen.getByRole("link", { name: "Daily 06:00" });
    expect(link).toHaveFocus();
    expect(link).toHaveAttribute("href", "/app/prj_story/runs/schedules/sch_daily");

    const click = vi.fn((event: MouseEvent) => event.preventDefault());
    link.addEventListener("click", click);
    await user.keyboard("{Enter}");
    link.removeEventListener("click", click);

    expect(click).toHaveBeenCalledOnce();
    expect(routerMock.push).not.toHaveBeenCalled();
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
