import { renderWithSharedMessages } from "@/i18n/test-support/render-with-feature-messages";
import type { DashboardSaveRequest } from "@/lib/dashboard-layout/draft";
import { beginDashboardDraft, finishDashboardSave } from "@/lib/dashboard-layout/draft";
import { presetDashboardLayout } from "@/lib/dashboard-layout/layout";
import { dashboardFixtureTranslate, organicAccess } from "@/lib/dashboard-layout/test-fixtures";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useRef, useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { DashboardLayoutEditor } from "./DashboardLayoutEditor";

function Harness({
  save = () => undefined,
  conflict = false,
  personalSave = true,
}: {
  save?: (request: DashboardSaveRequest) => void;
  conflict?: boolean;
  personalSave?: boolean;
}) {
  const [state, setState] = useState(() => beginDashboardDraft(presetDashboardLayout(), 7));
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement | null>(null);
  return (
    <>
      <button type="button" ref={trigger} onClick={() => setOpen(true)}>
        Customize
      </button>
      <output data-testid="draft-layout">{JSON.stringify(state.draft)}</output>
      {open ? (
        <DashboardLayoutEditor
          state={state}
          access={organicAccess}
          translate={dashboardFixtureTranslate}
          onChange={setState}
          canSavePersonalLayout={personalSave}
          onSave={(request) => {
            save(request);
            if (conflict)
              setState((saving) =>
                finishDashboardSave(saving, {
                  kind: "conflict",
                  attempt: request.attempt,
                  currentRevision: 8,
                }),
              );
          }}
          onCancel={(cancelled) => {
            setState(cancelled);
            setOpen(false);
          }}
          onClosedFocusReturn={() => trigger.current?.focus()}
        />
      ) : null}
    </>
  );
}

describe("controlled dashboard layout editor", () => {
  it("closes on Escape, restores the saved layout, and returns focus to Customize", async () => {
    const user = userEvent.setup();
    renderWithSharedMessages(<Harness />);
    const customize = screen.getByRole("button", { name: "Customize" });
    await user.click(customize);
    const before = screen.getByTestId("draft-layout").textContent;
    await user.click(screen.getByRole("switch", { name: "Movers" }));
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("heading", { name: "Customize dashboard" })).toBeNull();
    expect(screen.getByTestId("draft-layout")).toHaveTextContent(before ?? "");
    expect(customize).toHaveFocus();
  });
  it("moves by keyboard, restores usable focus at the edge, announces order, and cancel restores previous layout", async () => {
    const user = userEvent.setup();
    renderWithSharedMessages(<Harness />);
    const customize = screen.getByRole("button", { name: "Customize" });
    await user.click(customize);
    const before = screen.getByTestId("draft-layout").textContent;
    screen.getByRole("button", { name: "Move Position history up" }).focus();
    await user.keyboard("{Enter}");
    expect(screen.getByRole("button", { name: "Move Position history up" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Move Position history down" })).toHaveFocus();
    expect(screen.getByText("Moved Position history to position 1.")).toHaveAttribute(
      "role",
      "status",
    );
    expect(screen.getByTestId("draft-layout").textContent).not.toBe(before);
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByTestId("draft-layout").textContent).toBe(before);
    expect(customize).toHaveFocus();
  });

  it("changes display through owned controls, stores finite options, and submits the original CAS revision", async () => {
    const user = userEvent.setup();
    const save = vi.fn();
    renderWithSharedMessages(<Harness save={save} />);
    await user.click(screen.getByRole("button", { name: "Customize" }));
    expect(document.querySelector("select")).toBeNull();
    await user.click(screen.getByRole("switch", { name: "Movers" }));
    await user.click(screen.getByRole("button", { name: "Width of Organic metrics" }));
    await user.click(screen.getByRole("menuitem", { name: "Wide" }));
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(save).toHaveBeenCalledOnce();
    const request = save.mock.calls[0][0] as DashboardSaveRequest;
    expect(request.expectedRevision).toBe(7);
    expect(request.layout.widgets.find((widget) => widget.id === "movers")?.visible).toBe(false);
    expect(request.layout.widgets.find((widget) => widget.id === "organic_kpis")?.span).toBe(
      "wide",
    );
    expect(Object.keys(request.layout)).toEqual(["schemaVersion", "preset", "widgets"]);
  });

  it("preserves a conflicted local draft and disables retry instead of overwriting the default", async () => {
    const user = userEvent.setup();
    const save = vi.fn();
    renderWithSharedMessages(<Harness save={save} conflict />);
    await user.click(screen.getByRole("button", { name: "Customize" }));
    await user.click(screen.getByRole("switch", { name: "Movers" }));
    const edited = screen.getByTestId("draft-layout").textContent;
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByText(/Your draft is preserved/)).toHaveAttribute("role", "status");
    expect(screen.getByTestId("draft-layout").textContent).toBe(edited);
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    await user.keyboard("{Escape}");
    expect(screen.getByRole("heading", { name: "Customize dashboard" })).toBeInTheDocument();
    expect(screen.getByTestId("draft-layout").textContent).toBe(edited);
    expect(save).toHaveBeenCalledOnce();
  });

  it("supports Arrow, Home and End on the reorder handle, keeps focus, and announces positions", async () => {
    const user = userEvent.setup();
    renderWithSharedMessages(<Harness />);
    await user.click(screen.getByRole("button", { name: "Customize" }));
    const handle = screen.getByRole("button", { name: "Reorder Position history" });
    handle.focus();
    await user.keyboard("{End}");
    expect(screen.getByTestId("draft-layout").textContent).toMatch(
      /"quality_history".*"position_trend"/,
    );
    expect(handle).toHaveFocus();
    expect(screen.getAllByRole("status").find((node) => node.tagName === "P")).toHaveTextContent(
      "Moved Position history to position 12.",
    );
    await user.keyboard("{Home}");
    expect(screen.getAllByRole("status").find((node) => node.tagName === "P")).toHaveTextContent(
      "Moved Position history to position 1.",
    );
    expect(handle).toHaveFocus();
    await user.keyboard("{ArrowDown}");
    expect(screen.getAllByRole("status").find((node) => node.tagName === "P")).toHaveTextContent(
      "Moved Position history to position 2.",
    );
    await user.keyboard("{ArrowUp}");
    expect(screen.getAllByRole("status").find((node) => node.tagName === "P")).toHaveTextContent(
      "Moved Position history to position 1.",
    );
  });

  it("Escape closes an open width menu without cancelling the layout draft", async () => {
    const user = userEvent.setup();
    renderWithSharedMessages(<Harness />);
    await user.click(screen.getByRole("button", { name: "Customize" }));
    await user.click(screen.getByRole("switch", { name: "Movers" }));
    const edited = screen.getByTestId("draft-layout").textContent;
    await user.click(screen.getByRole("button", { name: "Width of Organic metrics" }));
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menuitem", { name: "Wide" })).toBeNull();
    expect(screen.getByRole("heading", { name: "Customize dashboard" })).toBeInTheDocument();
    expect(screen.getByTestId("draft-layout").textContent).toBe(edited);
  });

  it("restores focus after moving the DOM node so the next Home key still reorders", async () => {
    const user = userEvent.setup();
    renderWithSharedMessages(<Harness />);
    await user.click(screen.getByRole("button", { name: "Customize" }));
    const handle = screen.getByRole("button", { name: "Reorder Organic metrics" });
    handle.focus();
    fireEvent.keyDown(handle, { key: "End" });
    // Native browsers can blur a focused node after React moves it in the list.
    handle.blur();
    await waitFor(() => expect(handle).toHaveFocus());
    fireEvent.keyDown(handle, { key: "Home" });
    handle.blur();
    await waitFor(() => expect(handle).toHaveFocus());
    expect(screen.getByText("Moved Organic metrics to position 1.")).toBeInTheDocument();
  });

  it("does not run a queued focus return after cancellation unmounts the editor", async () => {
    const user = userEvent.setup();
    renderWithSharedMessages(<Harness />);
    const customize = screen.getByRole("button", { name: "Customize" });
    await user.click(customize);
    const handle = screen.getByRole("button", { name: "Reorder Organic metrics" });
    handle.focus();
    fireEvent.keyDown(handle, { key: "End" });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await Promise.resolve();
    expect(customize).toHaveFocus();
    expect(handle.isConnected).toBe(false);
  });

  it("keeps section descriptions in named help and Escape closes only that help", async () => {
    const user = userEvent.setup();
    renderWithSharedMessages(<Harness />);
    await user.click(screen.getByRole("button", { name: "Customize" }));
    expect(screen.queryByRole("tooltip")).toBeNull();
    const help = screen.getByRole("button", { name: "About Organic metrics" });
    await user.hover(help);
    expect(await screen.findByRole("tooltip")).toHaveTextContent(
      "Stored report for organic metrics.",
    );
    screen.getByRole("button", { name: "Reorder Organic metrics" }).focus();
    await user.tab();
    expect(help).toHaveFocus();
    expect(await screen.findByRole("tooltip")).toHaveTextContent(
      "Stored report for organic metrics.",
    );
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("tooltip")).toBeNull());
    expect(screen.getByRole("heading", { name: "Customize dashboard" })).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("heading", { name: "Customize dashboard" })).toBeNull();
  });

  it("Escape cancels a captured gesture without closing or discarding the draft", async () => {
    const user = userEvent.setup();
    renderWithSharedMessages(<Harness />);
    await user.click(screen.getByRole("button", { name: "Customize" }));
    await user.click(screen.getByRole("switch", { name: "Movers" }));
    const edited = screen.getByTestId("draft-layout").textContent;
    const handle = screen.getByRole("button", { name: "Reorder Position history" });
    Object.defineProperties(handle, {
      setPointerCapture: { value: vi.fn() },
      hasPointerCapture: { value: () => true },
      releasePointerCapture: { value: vi.fn() },
    });
    const down = new MouseEvent("pointerdown", { button: 0, clientY: 100, bubbles: true });
    Object.defineProperties(down, { pointerId: { value: 1 }, isPrimary: { value: true } });
    fireEvent(handle, down);
    await user.keyboard("{Escape}");
    expect(screen.getByRole("heading", { name: "Customize dashboard" })).toBeInTheDocument();
    expect(screen.getByTestId("draft-layout").textContent).toBe(edited);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("heading", { name: "Customize dashboard" })).toBeNull();
  });

  it("does not require measurement write privileges for an own personal layout, while respecting personal-save denial", async () => {
    const user = userEvent.setup();
    renderWithSharedMessages(<Harness personalSave={false} />);
    await user.click(screen.getByRole("button", { name: "Customize" }));
    await user.click(screen.getByRole("switch", { name: "Movers" }));
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    expect(
      screen.queryByText("Personal display only. Schedules and paid checks do not change."),
    ).toBeNull();
    await user.hover(screen.getByRole("button", { name: "About this view" }));
    expect(await screen.findByRole("tooltip")).toHaveTextContent(
      "This view shows saved results. It does not run checks.",
    );
  });

  it("retains unavailable widgets with a reason on hover and toggles no provider action", async () => {
    const user = userEvent.setup();
    const save = vi.fn();
    renderWithSharedMessages(<Harness save={save} />);
    fireEvent.click(screen.getByRole("button", { name: "Customize" }));
    fireEvent.click(screen.getByRole("switch", { name: "Contributors" }));
    expect(screen.getByRole("switch", { name: "Contributors" })).toBeChecked();
    const row = screen.getByRole("switch", { name: "Contributors" }).closest("li");
    expect(row).toHaveAttribute("data-reason", "missing_capability");
    expect(row?.querySelector("p")).toBeNull();
    expect(within(row as HTMLElement).getByRole("img")).toHaveAccessibleName(
      "This section's stored report is unavailable.",
    );
    const help = screen.getByRole("button", { name: "About Contributors" });
    const reason = "The stored data capability required by this section is unavailable.";
    expect(help).toHaveAccessibleDescription(`Stored report for contributors. ${reason}`);
    await user.hover(help);
    expect(await screen.findByRole("tooltip")).toHaveTextContent(reason);
    screen.getByRole("button", { name: "Reorder Contributors" }).focus();
    await user.tab();
    expect(help).toHaveFocus();
    expect(await screen.findByRole("tooltip")).toHaveTextContent(reason);
    expect(save).not.toHaveBeenCalled();
  });

  it("changing a preset is explicit and Local without a subject retains a reason", async () => {
    const user = userEvent.setup();
    renderWithSharedMessages(<Harness />);
    await user.click(screen.getByRole("button", { name: "Customize" }));
    await user.click(screen.getByRole("button", { name: "Dashboard preset" }));
    await user.click(screen.getByRole("menuitem", { name: "Local SEO" }));
    await waitFor(() =>
      expect(screen.getByTestId("draft-layout")).toHaveTextContent('"preset":"local"'),
    );
    expect(
      screen.getByRole("button", { name: "About Organic metrics" }),
    ).toHaveAccessibleDescription(/Select an explicit business identity revision for Local SEO\./);
  });
});
