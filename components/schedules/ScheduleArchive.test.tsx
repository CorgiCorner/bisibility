import { routerMock } from "@/tests/next-navigation";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ArchiveScheduleModal } from "./ArchiveScheduleModal";
import { type ScheduleListRow, SchedulesList } from "./SchedulesList";

const toast = vi.hoisted(() => vi.fn());
vi.mock("@/components/ui/toast-context", () => ({ useToast: () => ({ showToast: toast }) }));
const projectId = `prj_${"a".repeat(24)}`;
const schedule: ScheduleListRow = {
  publicId: `sch_${"a".repeat(24)}`,
  name: "Weekly review",
  frequency: "weekly",
  enabled: true,
  isDefault: true,
  keywordCount: 2,
  assignedKeywordCount: 3,
};
const other = {
  ...schedule,
  name: "Monthly review",
  publicId: `sch_${"b".repeat(24)}`,
  isDefault: false,
};
describe("schedule archive UI", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
  });
  it("offers a persistent archived filter even when there are no schedules", () => {
    render(
      <SchedulesList
        projectId={projectId}
        projectRef={projectId}
        schedules={[]}
        canUpdate
        status="current"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Schedule status" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Archived" }));
    expect(routerMock.push).toHaveBeenCalledWith(
      `/app/${projectId}/runs/schedules?status=archived`,
    );
  });
  it("archives to manual by default and explains the default schedule change", async () => {
    const close = vi.fn();
    render(
      <ArchiveScheduleModal
        projectId={projectId}
        schedule={schedule}
        schedules={[schedule, other]}
        onClose={close}
      />,
    );
    expect(screen.getByText("Move 3 keywords to")).toBeInTheDocument();
    expect(screen.getByText(/New keywords will use manual/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Archive schedule" }));
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        `/api/check-schedules/${schedule.publicId}/archive`,
        expect.objectContaining({
          body: JSON.stringify({ projectId, destinationScheduleId: null }),
        }),
      ),
    );
    expect(close).toHaveBeenCalled();
  });
  it("moves to an explicitly selected schedule and excludes archives and itself", async () => {
    render(
      <ArchiveScheduleModal
        projectId={projectId}
        schedule={schedule}
        schedules={[
          schedule,
          other,
          { ...other, publicId: "archived", name: "Old", archivedAt: "2026-09-01" },
        ]}
        onClose={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Move keywords to" }));
    expect(screen.queryByRole("menuitem", { name: schedule.name })).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Old" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("menuitem", { name: other.name }));
    fireEvent.click(screen.getByRole("button", { name: "Archive schedule" }));
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: JSON.stringify({ projectId, destinationScheduleId: other.publicId }),
        }),
      ),
    );
  });
  it("keeps the dialog open with the server error when archival fails", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      json: async () => ({ detail: "Choose a current schedule." }),
    } as Response);
    const close = vi.fn();
    render(
      <ArchiveScheduleModal
        projectId={projectId}
        schedule={schedule}
        schedules={[]}
        onClose={close}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Archive schedule" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Choose a current schedule.");
    expect(close).not.toHaveBeenCalled();
  });
  it("shows Restore instead of Resume for archived rows and hides management from readers", async () => {
    const archived = { ...schedule, archivedAt: "2026-09-01", enabled: false, isDefault: false };
    const view = render(
      <SchedulesList
        projectId={projectId}
        projectRef={projectId}
        schedules={[archived]}
        canUpdate
        canManage
        status="archived"
      />,
    );
    expect(screen.queryByRole("button", { name: /Resume/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Restore" }));
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        `/api/check-schedules/${schedule.publicId}/restore`,
        expect.any(Object),
      ),
    );
    view.rerender(
      <SchedulesList
        projectId={projectId}
        projectRef={projectId}
        schedules={[archived]}
        canUpdate={false}
        status="archived"
      />,
    );
    expect(screen.queryByRole("button", { name: "Restore" })).not.toBeInTheDocument();
  });
  it("opens archive from the row menu without navigating", async () => {
    render(
      <SchedulesList
        projectId={projectId}
        projectRef={projectId}
        schedules={[schedule]}
        canUpdate
        canManage
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: `Actions for ${schedule.name}` }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Archive" }));
    expect(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Archive schedule" }),
    ).toBeInTheDocument();
    expect(routerMock.push).not.toHaveBeenCalled();
  });
});
