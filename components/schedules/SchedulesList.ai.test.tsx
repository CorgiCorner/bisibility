import { renderWithProjectRunsMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import { routerMock } from "@/tests/next-navigation";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AiScheduleListRow, AiSchedulesController } from "./ai-schedule-rows";
import { type ScheduleListRow, SchedulesList } from "./SchedulesList";

const mocks = vi.hoisted(() => ({ showToast: vi.fn() }));
vi.mock("@/components/ui/toast-context", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/components/ui/toast-context")>()),
  useToast: () => ({ showToast: mocks.showToast }),
}));

const rank: ScheduleListRow = {
  enabled: true,
  frequency: "daily",
  isDefault: true,
  keywordCount: 12,
  memberDeviceCount: 1,
  memberMarketCount: 1,
  name: "Daily 06:00",
  nextRunAt: null,
  perRunCents: 14,
  publicId: "sch_daily",
  targetCount: 12,
  timeOfDay: "06:00",
  timezone: "Europe/Madrid",
};
const enabledAi: AiScheduleListRow = {
  archivedAt: null,
  cron: "0 9 * * 1",
  enabled: true,
  name: "Weekly prompts",
  nextRunAt: null,
  promptCount: 3,
  publicId: "ais_weekly",
  timezone: "Asia/Tokyo",
};
const disabledAi: AiScheduleListRow = {
  ...enabledAi,
  enabled: false,
  name: "Paused prompts",
  publicId: "ais_paused",
};

function controller(overrides: Partial<AiSchedulesController> = {}): AiSchedulesController {
  return {
    canWrite: true,
    activePromptCount: 2,
    onArchive: vi.fn().mockResolvedValue(undefined),
    onPause: vi.fn().mockResolvedValue(undefined),
    rows: [enabledAi, disabledAi],
    ...overrides,
  };
}

function renderList(overrides: Partial<ComponentProps<typeof SchedulesList>> = {}) {
  return render(
    <SchedulesList
      canManage
      canUpdate
      projectId="prj_story"
      projectRef="prj_story"
      schedules={[rank]}
      ai={controller()}
      {...overrides}
    />,
  );
}

describe("SchedulesList with AI schedules", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
  });
  afterEach(() => vi.useRealTimers());

  it("lists both kinds in one table with kind labels and a combined count", () => {
    renderList();
    expect(screen.getByRole("heading", { name: "3 schedules" })).toBeVisible();
    const aiRow = screen.getByRole("row", { name: /Weekly prompts/ });
    expect(within(aiRow).getByText("AI tracking")).toBeVisible();
    expect(within(aiRow).getByText("3 prompts")).toBeVisible();
    expect(within(aiRow).getByText("Custom - 0 9 * * 1")).toBeVisible();
    expect(within(aiRow).getByText("Asia/Tokyo")).toBeVisible();
    const rankRow = screen.getByRole("row", { name: /Daily 06:00/ });
    expect(within(rankRow).getByText("Rank checks")).toBeVisible();
    expect(within(rankRow).getByText("~$0.14")).toBeVisible();
  });

  it("pauses an AI row through the AI controller and never calls the rank API", async () => {
    const ai = controller();
    renderList({ ai });
    fireEvent.click(screen.getByRole("button", { name: "Pause Weekly prompts" }));
    await waitFor(() =>
      expect(ai.onPause).toHaveBeenCalledWith(expect.objectContaining(enabledAi)),
    );
    expect(fetch).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Pause Daily 06:00" }));
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith("/api/check-schedules/sch_daily", {
        body: JSON.stringify({ enabled: false, projectId: "prj_story" }),
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        method: "PATCH",
      }),
    );
    expect(ai.onPause).toHaveBeenCalledOnce();
  });

  it("resumes an AI row only by opening the reviewed drawer", () => {
    const ai = controller();
    renderList({ ai });
    fireEvent.click(screen.getByRole("button", { name: "Resume Paused prompts" }));
    expect(routerMock.push).toHaveBeenCalledWith("/app/prj_story/runs/schedules?ai=ais_paused");
    expect(ai.onPause).not.toHaveBeenCalled();
    expect(ai.onArchive).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("resolves links and row clicks per kind", () => {
    renderList();
    expect(screen.getByRole("link", { name: "Weekly prompts" })).toHaveAttribute(
      "href",
      "/app/prj_story/runs/schedules?ai=ais_weekly",
    );
    expect(screen.getByRole("link", { name: "Daily 06:00" })).toHaveAttribute(
      "href",
      "/app/prj_story/runs/schedules/sch_daily",
    );
    fireEvent.click(screen.getByRole("row", { name: /Weekly prompts/ }));
    expect(routerMock.push).toHaveBeenLastCalledWith("/app/prj_story/runs/schedules?ai=ais_weekly");
    fireEvent.click(screen.getByRole("row", { name: /Daily 06:00/ }));
    expect(routerMock.push).toHaveBeenLastCalledWith("/app/prj_story/runs/schedules/sch_daily");
    expect(screen.getByRole("link", { name: "New AI tracking schedule" })).toHaveAttribute(
      "href",
      "/app/prj_story/runs/schedules?ai=new",
    );
  });

  it("archives AI rows with a plain confirmation, never the keyword-move dialog", async () => {
    const user = userEvent.setup();
    const ai = controller();
    renderList({ ai });
    await user.click(screen.getByRole("button", { name: "Actions for Weekly prompts" }));
    await user.click(await screen.findByRole("menuitem", { name: "Archive" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/cannot be restored/)).toBeVisible();
    expect(within(dialog).queryByText(/Move/)).toBeNull();
    await user.click(within(dialog).getByRole("button", { name: "Archive schedule" }));
    await waitFor(() =>
      expect(ai.onArchive).toHaveBeenCalledWith(expect.objectContaining(enabledAi)),
    );
    expect(fetch).not.toHaveBeenCalled();
    expect(mocks.showToast).toHaveBeenCalledWith(
      "Prompt monitoring schedule archived. Past runs and results are preserved.",
      { severity: "success" },
    );
  });

  it("keeps AI rows out of the rank keyword-move destinations", async () => {
    const user = userEvent.setup();
    renderList();
    await user.click(screen.getByRole("button", { name: "Actions for Daily 06:00" }));
    await user.click(await screen.findByRole("menuitem", { name: "Archive" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: /Move 12 keywords to/ }));
    expect(screen.getAllByText("Weekly prompts")).toHaveLength(1);
    expect(screen.getAllByText("Paused prompts")).toHaveLength(1);
  });

  it("keeps archived AI rows read-only without a restore action", () => {
    renderList({
      status: "archived",
      schedules: [{ ...rank, archivedAt: "2026-09-08T17:00:00.000Z", enabled: false }],
      ai: controller({
        rows: [{ ...enabledAi, archivedAt: "2026-09-08T17:00:00.000Z", enabled: false }],
      }),
    });
    const aiRow = screen.getByRole("row", { name: /Weekly prompts/ });
    expect(within(aiRow).queryByRole("button")).toBeNull();
    expect(within(aiRow).queryByRole("link")).toBeNull();
    expect(within(aiRow).getByText("Read-only")).toBeVisible();
    fireEvent.click(aiRow);
    expect(routerMock.push).not.toHaveBeenCalled();
    const rankRow = screen.getByRole("row", { name: /Daily 06:00/ });
    expect(within(rankRow).getByRole("button", { name: "Restore" })).toBeVisible();
  });

  it("isolates pending state by kind", async () => {
    const ai = controller({ onPause: vi.fn(() => new Promise<void>(() => undefined)) });
    renderList({ ai });
    fireEvent.click(screen.getByRole("button", { name: "Pause Weekly prompts" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Pause Weekly prompts" })).toBeDisabled(),
    );
    expect(screen.getByRole("button", { name: "Pause Daily 06:00" })).toBeEnabled();
  });

  it("hides AI writes for rank-only rights and rank writes for AI-only rights", () => {
    const { unmount } = renderList({ ai: controller({ canWrite: false }) });
    expect(screen.queryByRole("button", { name: /Weekly prompts/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Resume Paused prompts" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Weekly prompts" })).toBeNull();
    expect(screen.queryByRole("link", { name: "New AI tracking schedule" })).toBeNull();
    expect(screen.getByRole("button", { name: "Pause Daily 06:00" })).toBeVisible();
    unmount();

    renderList({ canManage: false, canUpdate: false });
    expect(screen.queryByRole("button", { name: "Pause Daily 06:00" })).toBeNull();
    expect(screen.queryByRole("link", { name: "New schedule" })).toBeNull();
    expect(screen.getByRole("button", { name: "Pause Weekly prompts" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Actions for Weekly prompts" })).toBeVisible();
  });

  it("renders rank rows only when AI tracking is unavailable", () => {
    renderList({ ai: undefined });
    expect(screen.getByRole("heading", { name: "1 schedule" })).toBeVisible();
    expect(screen.queryByText("Rank checks")).toBeNull();
    expect(screen.queryByRole("link", { name: "New AI tracking schedule" })).toBeNull();
  });

  it("shows AI next runs in the schedule time zone, pending, disabled and empty states", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-19T12:00:00.000Z"));
    renderList({
      ai: controller({
        rows: [
          { ...enabledAi, nextRunAt: "2026-10-20T00:30:00.000Z" },
          { ...enabledAi, name: "Unplanned", publicId: "ais_unplanned" },
          disabledAi,
          { ...enabledAi, name: "No prompts", promptCount: 0, publicId: "ais_empty" },
        ],
      }),
    });
    expect(
      within(screen.getByRole("row", { name: /Weekly prompts/ })).getByText("tomorrow 09:30"),
    ).toBeVisible();
    expect(
      within(screen.getByRole("row", { name: /Unplanned/ })).getByText("Pending"),
    ).toBeVisible();
    const disabledRow = screen.getByRole("row", { name: /Paused prompts/ });
    expect(within(disabledRow).getByText("Paused")).toBeVisible();
    expect(within(disabledRow).queryByText("Pending")).toBeNull();
    expect(
      within(screen.getByRole("row", { name: /No prompts/ })).getByText("Add prompts to start"),
    ).toBeVisible();
  });
});
