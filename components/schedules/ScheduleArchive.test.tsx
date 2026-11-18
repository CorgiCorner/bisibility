import { createSpendPreview } from "@/components/schedules/keyword-create-review.test-support";
import { renderWithProjectRunsMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import { routerMock } from "@/tests/next-navigation";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
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
  keywordCount: 2,
  assignedKeywordCount: 3,
};
const other = {
  ...schedule,
  name: "Monthly review",
  publicId: `sch_${"b".repeat(24)}`,
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
    expect(routerMock.push).toHaveBeenCalledWith(`/app/${projectId}/schedules?status=archived`);
  });
  it("archives to manual without a default schedule notice", async () => {
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
    expect(screen.queryByText("New keywords stay manual until assigned to a schedule.")).toBeNull();
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
    fireEvent.click(screen.getByRole("button", { name: "Move 3 keywords to" }));
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
    const archived = { ...schedule, archivedAt: "2026-09-01", enabled: false };
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

const spendPort = vi.hoisted(() => ({ preview: vi.fn() }));
vi.mock("@/lib/schedules/preview-client", async (original) => ({
  ...(await original<typeof import("@/lib/schedules/preview-client")>()),
  requestScheduleChangePreview: spendPort.preview,
}));
beforeEach(() =>
  spendPort.preview.mockResolvedValue({
    ...createSpendPreview,
    requires_review: false,
    preview_token: null,
  }),
);

it.each(["cancel", "confirm"] as const)(
  "archive transfer %s uses the shared spend review before POST",
  async (decision) => {
    spendPort.preview.mockResolvedValue(createSpendPreview);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
    const close = vi.fn();
    render(
      <ArchiveScheduleModal
        projectId={projectId}
        schedule={schedule}
        schedules={[schedule, other]}
        onClose={close}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Move 3 keywords to" }));
    fireEvent.click(screen.getByRole("menuitem", { name: other.name }));
    fireEvent.click(screen.getByRole("button", { name: "Archive schedule" }));
    const confirm = await screen.findByRole("button", { name: "Confirm" });
    expect(fetch).not.toHaveBeenCalled();
    expect(spendPort.preview).toHaveBeenCalledWith(
      expect.objectContaining({
        change: expect.objectContaining({
          op: "state",
          state: "archived",
          command: expect.objectContaining({
            archive: expect.objectContaining({ destinationScheduleId: other.publicId }),
          }),
        }),
      }),
    );
    if (decision === "cancel") {
      const dialog = confirm.closest("[role=dialog]");
      if (!dialog) throw new Error("Missing shared cost dialog");
      fireEvent.click(within(dialog as HTMLElement).getByRole("button", { name: "Cancel" }));
      await waitFor(() => expect(screen.queryByRole("button", { name: "Confirm" })).toBeNull());
      expect(fetch).not.toHaveBeenCalled();
      expect(close).not.toHaveBeenCalled();
      expect(screen.getByRole("button", { name: "Move 3 keywords to" })).toHaveTextContent(
        other.name,
      );
    } else {
      fireEvent.click(confirm);
      await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
      expect(
        JSON.parse(vi.mocked(fetch).mock.calls[0][1]?.body as string).review.preview_token,
      ).toBe(createSpendPreview.preview_token);
    }
  },
);
