import { renderWithSharedMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import { presetDashboardLayout } from "@/lib/dashboard-layout/layout";
import { organicAccess } from "@/lib/dashboard-layout/test-fixtures";
import {
  type DashboardSurfacePreference,
  dashboardLayoutFor,
} from "@/lib/project-surface-preferences/dashboard-model";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PersonalDashboardSurface } from "./PersonalDashboardSurface";

const actions = vi.hoisted(() => ({ read: vi.fn(), save: vi.fn(), setDefault: vi.fn() }));
vi.mock("@/lib/project-surface-preferences/dashboard-actions", () => ({
  readDashboardPreference: actions.read,
  saveDashboardLayout: actions.save,
  setDashboardDefault: actions.setDefault,
}));
const local = presetDashboardLayout("local");
const initial: DashboardSurfacePreference = {
  projectId: "prj_abcdefghijklmnopqrstuvwx",
  revision: 7,
  defaultPreset: "general",
  presentation: {
    schemaVersion: 1,
    layouts: {
      local: {
        ...local,
        widgets: local.widgets.map((widget) =>
          widget.id === "movers" ? { ...widget, visible: false, span: "wide" } : widget,
        ),
      },
    },
  },
};
function surface(preset: "general" | "local" = "general") {
  return render(
    <PersonalDashboardSurface
      access={{ ...organicAccess, projectId: initial.projectId }}
      preference={initial}
      layout={dashboardLayoutFor(initial, preset)}
      widgets={{}}
      shell={{
        scope: "Scope",
        mode: "Display",
        health: "Health",
        budget: "Budget",
        coverage: "Coverage",
      }}
    />,
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  actions.read.mockResolvedValue({ ok: true, value: { ...initial, revision: 8 } });
  actions.setDefault.mockResolvedValue({
    ok: false,
    error: { status: 409, code: "preferences_conflict" },
  });
});
describe("dashboard preference regressions", () => {
  it("loads the selected preset's saved widget choices before saving", async () => {
    surface();
    fireEvent.click(screen.getByRole("button", { name: "Customize dashboard" }));
    const picker = screen.getAllByRole("button", { name: "Dashboard preset" }).at(-1);
    if (!picker) throw new Error("Expected editor preset picker");
    fireEvent.click(picker);
    fireEvent.click(await screen.findByRole("menuitem", { name: "Local SEO" }));
    expect(screen.getByRole("switch", { name: "Movers" })).not.toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: /^Save$/ }));
    await waitFor(() =>
      expect(actions.save).toHaveBeenCalledWith(
        expect.objectContaining({
          layout: expect.objectContaining({
            preset: "local",
            widgets: expect.arrayContaining([
              expect.objectContaining({ id: "movers", visible: false, span: "wide" }),
            ]),
          }),
        }),
      ),
    );
  });
  it("resets a saved preset only through the separate reset action without writing", async () => {
    surface();
    fireEvent.click(screen.getByRole("button", { name: "Customize dashboard" }));
    const picker = screen.getAllByRole("button", { name: "Dashboard preset" }).at(-1);
    if (!picker) throw new Error("Expected editor preset picker");
    fireEvent.click(picker);
    fireEvent.click(await screen.findByRole("menuitem", { name: "Local SEO" }));
    expect(screen.getByRole("switch", { name: "Movers" })).not.toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "Reset to preset" }));
    expect(screen.getByRole("switch", { name: "Movers" })).toBeChecked();
    expect(
      initial.presentation.layouts.local?.widgets.find(({ id }) => id === "movers"),
    ).toMatchObject({ visible: false, span: "wide" });
    expect(actions.save).not.toHaveBeenCalled();
  });
  it("resetting an uncustomized preset leaves its initial layout clean", () => {
    surface();
    fireEvent.click(screen.getByRole("button", { name: "Customize dashboard" }));
    expect(screen.getByRole("button", { name: /^Save$/ })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Reset to preset" }));
    expect(screen.getByRole("button", { name: /^Save$/ })).toBeDisabled();
    expect(actions.save).not.toHaveBeenCalled();
  });
  it("keeps a failed conflict read locked and allows an explicit reload before review", async () => {
    actions.read.mockRejectedValueOnce(new Error("Temporary read failure"));
    surface("local");
    fireEvent.click(screen.getByRole("button", { name: "Set as my default" }));
    const review = await screen.findByRole("region", { name: "Review the current saved layout" });
    await waitFor(() =>
      expect(within(review).getByRole("button", { name: "Reload stored layout" })).toBeEnabled(),
    );
    expect(
      screen.getByText("The stored layout could not be reloaded. Your draft is preserved."),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Set as my default" })).toBeDisabled();
    expect(within(review).queryByRole("button", { name: "Keep my draft" })).not.toBeInTheDocument();
    fireEvent.click(within(review).getByRole("button", { name: "Reload stored layout" }));
    expect(await within(review).findByRole("button", { name: "Keep my draft" })).toBeVisible();
    expect(actions.setDefault).toHaveBeenCalledOnce();
    expect(actions.save).not.toHaveBeenCalled();
  });
  it("requires explicit review of a newer revision after default conflict, then retries it", async () => {
    surface("local");
    fireEvent.click(screen.getByRole("button", { name: "Set as my default" }));
    const review = await screen.findByRole("region", { name: "Review the current saved layout" });
    expect(actions.read).toHaveBeenCalledExactlyOnceWith(initial.projectId);
    expect(screen.getByRole("button", { name: "Set as my default" })).toBeDisabled();
    expect(actions.setDefault).toHaveBeenCalledOnce();
    const useCurrent = within(review).getByRole("button", { name: "Use the current layout" });
    await waitFor(() => expect(useCurrent).toBeEnabled());
    fireEvent.click(useCurrent);
    actions.setDefault.mockResolvedValue({
      ok: true,
      value: { ...initial, revision: 9, defaultPreset: "local" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Set as my default" }));
    await waitFor(() =>
      expect(actions.setDefault).toHaveBeenLastCalledWith({
        projectId: initial.projectId,
        expectedRevision: 8,
        preset: "local",
      }),
    );
    expect(actions.save).not.toHaveBeenCalled();
  });
});
