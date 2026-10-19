import {
  projectRunsFeatureTestMessages,
  renderWithProjectRunsMessages as render,
} from "@/i18n/test-support/render-with-feature-messages";
import { unstable_rethrow } from "@/tests/next-navigation";
import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SchedulesPage from "./page";

const mocks = vi.hoisted(() => ({
  canProjectAction: vi.fn(),
  getAiTrackingScheduleList: vi.fn(),
  getProjectRole: vi.fn(),
  listCheckScheduleRows: vi.fn(),
  listRankCheckRuns: vi.fn(),
  loadCoreMessages: vi.fn(),
  requireReadableProject: vi.fn(),
  resolveProjectAccess: vi.fn(),
  resolveRegionalDocumentLocale: vi.fn(),
}));

let capturedListProps: Record<string, unknown> = {};
let capturedDrawerProps: Record<string, unknown> | null = null;

vi.mock("@/lib/queries/_auth", () => ({
  requireReadableProject: mocks.requireReadableProject,
  resolveProjectAccess: mocks.resolveProjectAccess,
}));
vi.mock("@/lib/actions/ai-tracking", () => ({
  getAiTrackingScheduleList: mocks.getAiTrackingScheduleList,
  mutateAiTrackingAction: vi.fn(),
  previewAiTrackingAction: vi.fn(),
}));
vi.mock("@/lib/actions/ai-research", () => ({ getAiResearchCatalogAction: vi.fn() }));
vi.mock("@/i18n/catalog-loader.server", () => ({ loadCoreMessages: mocks.loadCoreMessages }));
vi.mock("@/i18n/document-locale.server", () => ({
  resolveRegionalDocumentLocale: mocks.resolveRegionalDocumentLocale,
}));
vi.mock("@/components/ai-tracking/AiScheduleDrawerHost", () => ({
  AiScheduleDrawerHost: (props: Record<string, unknown>) => {
    capturedDrawerProps = props;
    return <div data-testid="ai-schedule-drawer" />;
  },
}));
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

const aiList = {
  canWrite: true,
  activePromptIds: ["aip_neutral"],
  schedules: [
    {
      id: "ais_weekly",
      name: "Weekly prompts",
      cron: "0 9 * * 1",
      timezone: "UTC",
      enabled: false,
      nextRunAt: null,
      archivedAt: null,
      promptIds: ["aip_neutral"],
      configurations: [],
    },
  ],
};

describe("SchedulesPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedListProps = {};
    capturedDrawerProps = null;
    mocks.getAiTrackingScheduleList.mockResolvedValue(null);
    mocks.resolveRegionalDocumentLocale.mockResolvedValue({ locale: "en", timeZone: "UTC" });
    mocks.loadCoreMessages.mockResolvedValue(projectRunsFeatureTestMessages);
    mocks.canProjectAction.mockReturnValue(true);
    mocks.getProjectRole.mockReturnValue("owner");
    mocks.listCheckScheduleRows.mockResolvedValue([
      {
        cronExpression: null,
        dayOfMonth: 1,
        enabled: true,
        frequency: "daily",
        isDefault: true,
        jitterMinutes: 15,
        keywordCount: 2,
        memberDeviceCount: 1,
        memberMarketCount: 2,
        name: "Daily 06:00",
        perRunCents: 48,
        publicId: "sch_daily",
        sharedTag: null,
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

  it("renders the authorized list under the Runs navigation", async () => {
    render(await SchedulesPage({ params: Promise.resolve({ project: "prj_1" }) }));

    expect(screen.getByRole("link", { name: "Schedules" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Runs" })).toHaveAttribute("href", "/app/prj_1/runs");
    expect(screen.queryByRole("link", { name: "Rank Tracker" })).not.toBeInTheDocument();
    expect(screen.getByTestId("schedules-list")).toBeVisible();
    expect(screen.queryByText("Schedules", { selector: "p" })).not.toBeInTheDocument();
    expect(capturedListProps).toMatchObject({
      canUpdate: true,
      projectId: "prj_1",
      projectRef: "prj_1",
      schedules: [expect.objectContaining({ name: "Daily 06:00" })],
    });
    expect(mocks.listCheckScheduleRows).toHaveBeenCalledWith("project_1", "current");
  });

  it("passes the next-run instant to the locale-aware list", async () => {
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
        memberDeviceCount: 1,
        memberMarketCount: 2,
        nextRunAt: "2026-09-04T04:00:00.000Z",
        perRunCents: 48,
        targetCount: 4,
      }),
    ]);
    vi.useRealTimers();
  });

  it("renders rank rows unchanged when AI tracking is unavailable", async () => {
    render(await SchedulesPage({ params: Promise.resolve({ project: "prj_1" }) }));

    expect(mocks.getAiTrackingScheduleList).toHaveBeenCalledWith("prj_1", "current");
    expect(capturedListProps.ai).toBeUndefined();
    expect(capturedListProps.schedules).toEqual([
      expect.not.objectContaining({ scheduleKind: expect.anything() }),
    ]);
    expect(mocks.loadCoreMessages).toHaveBeenCalledWith("en", [
      "shared",
      "projectRuns",
      "projectAiTracking",
    ]);
    expect(capturedDrawerProps).toBeNull();
  });

  it("keeps rank schedules visible and names an AI storage failure", async () => {
    mocks.getAiTrackingScheduleList.mockRejectedValue(new Error("database unavailable"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      render(await SchedulesPage({ params: Promise.resolve({ project: "prj_1" }) }));
      expect(screen.getByTestId("schedules-list")).toBeVisible();
      expect(
        screen.getByText(
          "Prompt monitoring schedules could not be loaded. Rank schedules are shown below.",
        ),
      ).toBeVisible();
      expect(capturedListProps.ai).toBeUndefined();
      expect(warn).toHaveBeenCalledWith("AI schedules could not be loaded", { errorType: "Error" });
    } finally {
      warn.mockRestore();
    }
  });

  it("preserves framework navigation failures before degrading optional AI data", async () => {
    const controlFlow = new Error("framework control flow");
    mocks.getAiTrackingScheduleList.mockRejectedValue(controlFlow);
    unstable_rethrow.mockImplementationOnce((error) => {
      throw error;
    });
    await expect(SchedulesPage({ params: Promise.resolve({ project: "prj_1" }) })).rejects.toBe(
      controlFlow,
    );
    expect(unstable_rethrow).toHaveBeenCalledWith(controlFlow);
  });
  it("passes AI rows with their own write rule and opens the drawer from ?ai=", async () => {
    mocks.getAiTrackingScheduleList.mockResolvedValue(aiList);
    mocks.canProjectAction.mockReturnValue(false);

    render(
      await SchedulesPage({
        params: Promise.resolve({ project: "prj_1" }),
        searchParams: Promise.resolve({ ai: "ais_weekly" }),
      }),
    );

    expect(capturedListProps).toMatchObject({
      canManage: false,
      canUpdate: false,
      ai: {
        canWrite: true,
        rows: [
          {
            archivedAt: null,
            cron: "0 9 * * 1",
            enabled: false,
            name: "Weekly prompts",
            nextRunAt: null,
            promptCount: 1,
            publicId: "ais_weekly",
            timezone: "UTC",
          },
        ],
      },
    });
    expect(mocks.loadCoreMessages).toHaveBeenCalledWith("en", [
      "shared",
      "projectRuns",
      "projectAiTracking",
    ]);
    expect(capturedDrawerProps).toMatchObject({
      activePromptIds: ["aip_neutral"],
      projectId: "prj_1",
      target: "ais_weekly",
    });
  });

  it("does not open the AI drawer for read-only AI access or archived views", async () => {
    mocks.getAiTrackingScheduleList.mockResolvedValue({ ...aiList, canWrite: false });
    render(
      await SchedulesPage({
        params: Promise.resolve({ project: "prj_1" }),
        searchParams: Promise.resolve({ ai: "ais_weekly" }),
      }),
    );
    expect(capturedDrawerProps).toBeNull();
    expect(mocks.loadCoreMessages).toHaveBeenCalledWith("en", [
      "shared",
      "projectRuns",
      "projectAiTracking",
    ]);

    mocks.getAiTrackingScheduleList.mockResolvedValue(aiList);
    render(
      await SchedulesPage({
        params: Promise.resolve({ project: "prj_1" }),
        searchParams: Promise.resolve({ ai: "ais_weekly", status: "archived" }),
      }),
    );
    expect(mocks.getAiTrackingScheduleList).toHaveBeenLastCalledWith("prj_1", "archived");
    expect(mocks.loadCoreMessages).toHaveBeenLastCalledWith("en", [
      "shared",
      "projectRuns",
      "projectAiTracking",
    ]);
    expect(capturedDrawerProps).toBeNull();
  });

  it("rejects an unauthorized actor before rendering the route", async () => {
    mocks.requireReadableProject.mockRejectedValue(new Error("Unauthorized"));

    await expect(SchedulesPage({ params: Promise.resolve({ project: "prj_1" }) })).rejects.toThrow(
      "Unauthorized",
    );
    expect(mocks.requireReadableProject).toHaveBeenCalledWith("prj_1");
    expect(mocks.loadCoreMessages).not.toHaveBeenCalled();
  });
});
