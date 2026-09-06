import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SchedulesPage from "./page";

const mocks = vi.hoisted(() => ({
  canProjectAction: vi.fn(),
  getProjectRole: vi.fn(),
  listCheckScheduleRows: vi.fn(),
  listRankCheckRuns: vi.fn(),
  requireReadableProject: vi.fn(),
  resolveProjectAccess: vi.fn(),
}));

let capturedListProps: Record<string, unknown> = {};

vi.mock("@/lib/queries/_auth", () => mocks);
vi.mock("@/lib/auth/authorize", () => ({ getProjectRole: mocks.getProjectRole }));
vi.mock("@/lib/auth/capabilities", () => ({ canProjectAction: mocks.canProjectAction }));
vi.mock("@/lib/queries/check-schedule-list", () => ({
  listCheckScheduleRows: mocks.listCheckScheduleRows,
}));
vi.mock("@/lib/queries/rank-check-runs", () => ({
  listRankCheckRuns: mocks.listRankCheckRuns,
}));
vi.mock("@/components/schedules/SchedulesList", () => ({
  SchedulesList: (props: Record<string, unknown>) => {
    capturedListProps = props;
    return <div data-testid="schedules-list" />;
  },
}));

describe("SchedulesPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedListProps = {};
    mocks.canProjectAction.mockReturnValue(true);
    mocks.getProjectRole.mockReturnValue("owner");
    mocks.listCheckScheduleRows.mockResolvedValue([
      {
        cronExpression: null,
        dayOfMonth: "1st",
        enabled: true,
        frequency: "daily",
        isDefault: true,
        jitterMinutes: 15,
        keywordCount: 2,
        memberMeta: "2 markets x 1 device",
        name: "Daily 06:00",
        perRunCents: 48,
        publicId: "sch_daily",
        tagScope: null,
        timeOfDay: "06:00",
        targetCount: 4,
        timezone: "Europe/Warsaw",
        weekday: "Monday",
      },
    ]);
    mocks.listRankCheckRuns.mockResolvedValue({ data: [], nextCursor: null });
    mocks.resolveProjectAccess.mockResolvedValue({ publicId: "prj_1" });
    mocks.requireReadableProject.mockResolvedValue({
      actor: { id: "user_1", memberships: [{ projectId: "project_1", role: "owner" }] },
      project: { id: "project_1", publicId: "prj_1" },
    });
  });

  it("renders the authorized list with a breadcrumb and no navigation subtitle", async () => {
    render(await SchedulesPage({ params: Promise.resolve({ project: "prj_1" }) }));

    expect(screen.getByRole("heading", { name: "Schedules" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Rank Tracker" })).toHaveAttribute(
      "href",
      "/app/prj_1/rank-tracker",
    );
    expect(screen.getByTestId("schedules-list")).toBeVisible();
    expect(screen.queryByText("Schedules", { selector: "p" })).not.toBeInTheDocument();
    expect(capturedListProps).toMatchObject({
      canUpdate: true,
      projectId: "prj_1",
      projectRef: "prj_1",
      schedules: [expect.objectContaining({ name: "Daily 06:00" })],
    });
    expect(mocks.listCheckScheduleRows).toHaveBeenCalledWith("project_1");
  });

  it("passes schedule data and a relative next-run label to the list", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-03T10:00:00.000Z"));
    mocks.listRankCheckRuns.mockResolvedValue({
      data: [
        {
          checkSchedulePublicId: "sch_daily",
          plannedFor: "2026-09-04T04:00:00.000Z",
          status: "planned",
        },
      ],
      nextCursor: null,
    });

    render(await SchedulesPage({ params: Promise.resolve({ project: "prj_1" }) }));

    expect(capturedListProps.schedules).toEqual([
      expect.objectContaining({
        memberMeta: "2 markets x 1 device",
        nextRunLabel: "tomorrow 06:00",
        perRunCents: 48,
        targetCount: 4,
      }),
    ]);
    vi.useRealTimers();
  });

  it("rejects an unauthorized actor before rendering the route", async () => {
    mocks.requireReadableProject.mockRejectedValue(new Error("Unauthorized"));

    await expect(SchedulesPage({ params: Promise.resolve({ project: "prj_1" }) })).rejects.toThrow(
      "Unauthorized",
    );
    expect(mocks.requireReadableProject).toHaveBeenCalledWith("prj_1");
  });
});
