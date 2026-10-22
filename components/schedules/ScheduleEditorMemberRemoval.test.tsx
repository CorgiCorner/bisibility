import { dataTableLayoutKey } from "@/components/ui/data-table/data-table-layout-store";
import { renderWithProjectRunsMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import { routerMock } from "@/tests/next-navigation";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ScheduleEditor } from "./ScheduleEditor";

const schedule = {
  publicId: "sch_saved",
  name: "Daily",
  cronExpression: null,
  enabled: true,
  frequency: "daily",
  isDefault: false,
  jitterMinutes: 15,
  keywordCount: 1,
  providerPolicy: null,
  serpDepth: null,
  timeOfDay: null,
  timezone: "UTC",
};
const member = {
  publicId: "kw_member",
  name: "retained keyword",
  targetCount: 1,
  market: "Poland",
  device: "Desktop",
  tags: [],
  scheduleId: schedule.publicId,
};
function editor(canEdit = true, pending = false) {
  return render(
    <ScheduleEditor
      canEdit={canEdit}
      connectedProviders={[]}
      projectId="prj_test"
      projectDefaults={{ provider: null, serpDepth: 20 }}
      projectTimezone="UTC"
      schedule={schedule}
      isNew={pending}
      candidates={pending ? [] : [member]}
      pendingMembers={pending ? [{ ...member, scheduleId: null, pending: true }] : []}
    />,
  );
}
function removeMember() {
  fireEvent.click(screen.getByRole("button", { name: "Actions for retained keyword" }));
  fireEvent.click(screen.getByRole("menuitem", { name: "Remove from schedule" }));
}
beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.unstubAllGlobals());
describe("schedule member removal", () => {
  it("keeps the final action cell wide enough and pinned right before and after scrolling", () => {
    editor();
    const table = screen.getByTestId("schedule-editor-members");
    const menu = screen.getByRole("button", { name: "Actions for retained keyword" });
    const cell = menu.closest('[role="cell"]');
    expect(cell).toHaveAttribute("data-column-id", "actions");
    expect(within(screen.getAllByRole("row").at(-1)!).getAllByRole("cell").at(-1)).toBe(cell);
    expect(table.style.getPropertyValue("--dt-col-actions")).toBe("64px");
    expect(cell).toHaveStyle({ position: "sticky", right: "var(--dt-pin-actions)" });
    expect(table.style.getPropertyValue("--dt-pin-actions")).toBe("0px");
    expect(screen.getByRole("columnheader", { name: "Actions" })).toHaveStyle({
      position: "sticky",
      right: "var(--dt-pin-actions)",
    });
    table.scrollLeft = 160;
    fireEvent.scroll(table);
    expect(cell).toHaveStyle({ position: "sticky", right: "var(--dt-pin-actions)" });
    expect(menu).toBeVisible();
  });
  it("ignores stale hidden and undersized action preferences", () => {
    editor();
    const key = dataTableLayoutKey("schedule-editor-members");
    fireEvent(
      window,
      new StorageEvent("storage", {
        key,
        newValue: JSON.stringify({
          columnSizing: { actions: 48 },
          columnVisibility: { actions: false },
        }),
      }),
    );
    try {
      const menu = screen.getByRole("button", { name: "Actions for retained keyword" });
      expect(menu).toBeVisible();
      expect(menu.closest('[role="cell"]')).toHaveStyle({
        position: "sticky",
        right: "var(--dt-pin-actions)",
      });
      expect(
        screen.getByTestId("schedule-editor-members").style.getPropertyValue("--dt-col-actions"),
      ).toBe("64px");
    } finally {
      fireEvent(window, new StorageEvent("storage", { key, newValue: null }));
    }
  });
  it("opens the same removal menu and invokes it by keyboard", async () => {
    const user = userEvent.setup();
    const fetch = vi.fn(async () => new Response("{}"));
    vi.stubGlobal("fetch", fetch);
    editor();
    screen.getByRole("button", { name: "Actions for retained keyword" }).focus();
    await user.keyboard("{ArrowDown}");
    const action = await screen.findByRole("menuitem", { name: "Remove from schedule" });
    await waitFor(() => expect(action).toHaveFocus());
    await user.keyboard("{Enter}");
    await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
  });
  it("uses the membership-only DELETE after explicit overflow selection and refreshes", async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ data: { updated: 1 } })));
    vi.stubGlobal("fetch", fetch);
    editor();
    expect(fetch).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: "Actions for retained keyword" }).closest('[role="cell"]'),
    ).toHaveStyle({ position: "sticky", right: "var(--dt-pin-actions)" });
    expect(
      screen.getByTestId("schedule-editor-members").style.getPropertyValue("--dt-pin-actions"),
    ).toBe("0px");
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Keep this edit" } });
    expect(screen.queryByRole("button", { name: "Remove from schedule" })).toBeNull();
    removeMember();
    await waitFor(() => expect(routerMock.refresh).toHaveBeenCalledOnce());
    expect(screen.getByLabelText("Name")).toHaveValue("Keep this edit");
    expect(screen.getByRole("button", { name: "Save schedule" })).toBeEnabled();
    expect(fetch).toHaveBeenCalledWith(
      "/api/check-schedules/sch_saved/keywords",
      expect.objectContaining({
        method: "DELETE",
        body: JSON.stringify({ projectId: "prj_test", keywordIds: [member.publicId] }),
      }),
    );
  });
  it("keeps the keyword and edited form after a failed removal", async () => {
    const fetch = vi.fn(
      async () =>
        new Response(JSON.stringify({ detail: "private server detail" }), { status: 403 }),
    );
    vi.stubGlobal("fetch", fetch);
    editor();
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Unsaved schedule name" } });
    removeMember();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not remove the keyword from this schedule. Try again.",
    );
    expect(screen.getByText(member.name)).toBeVisible();
    expect(screen.getByLabelText("Name")).toHaveValue("Unsaved schedule name");
    expect(screen.queryByText("private server detail")).toBeNull();
    expect(routerMock.refresh).not.toHaveBeenCalled();
  });
  it("removes staged membership locally without a request", () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    editor(true, true);
    removeMember();
    expect(screen.queryByText(member.name)).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });
  it("disables another removal while the request is pending", async () => {
    let complete!: () => void;
    const response = new Promise<Response>((resolve) => {
      complete = () => resolve(new Response("{}"));
    });
    const fetch = vi.fn(() => response);
    vi.stubGlobal("fetch", fetch);
    editor();
    removeMember();
    fireEvent.click(screen.getByRole("button", { name: "Actions for retained keyword" }));
    const action = screen.getByRole("menuitem", { name: "Remove from schedule" });
    expect(action).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(action);
    expect(fetch).toHaveBeenCalledOnce();
    complete();
    await waitFor(() => expect(routerMock.refresh).toHaveBeenCalledOnce());
  });
  it("does not offer member actions to a reader", () => {
    editor(false);
    expect(screen.queryByRole("button", { name: "Actions for retained keyword" })).toBeNull();
  });
});
