import { renderWithSharedMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import { organicAccess } from "@/lib/dashboard-layout/test-fixtures";
import {
  type DashboardSurfacePreference,
  dashboardLayoutFor,
} from "@/lib/project-surface-preferences/dashboard-model";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { PersonalDashboardSurface } from "./PersonalDashboardSurface";

const actions = vi.hoisted(() => ({ read: vi.fn(), save: vi.fn(), setDefault: vi.fn() }));
vi.mock("@/lib/project-surface-preferences/dashboard-actions", () => ({
  readDashboardPreference: actions.read,
  saveDashboardLayout: actions.save,
  setDashboardDefault: actions.setDefault,
}));
const preference: DashboardSurfacePreference = {
  projectId: "prj_abcdefghijklmnopqrstuvwx",
  revision: 7,
  defaultPreset: "general",
  presentation: { schemaVersion: 1, layouts: {} },
};
beforeEach(() => vi.resetAllMocks());
function mount() {
  render(
    <PersonalDashboardSurface
      access={{ ...organicAccess, projectId: preference.projectId }}
      preference={preference}
      layout={dashboardLayoutFor(preference, "local")}
      widgets={{}}
      shell={{
        scope: "Scope",
        mode: "Mode",
        health: "Health",
        budget: "Budget",
        coverage: "Coverage",
      }}
    />,
  );
}
it("opens customization directly in a modal with all persistence actions inside it", async () => {
  mount();
  expect(screen.queryByRole("button", { name: "Set as my default" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Customize dashboard" }));
  const modal = await screen.findByRole("dialog", { name: "Customize dashboard" });
  expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  expect(within(modal).getByRole("button", { name: /^Save$/ })).toBeInTheDocument();
  expect(within(modal).getByRole("button", { name: "Set as my default" })).toBeEnabled();
  expect(actions.save).not.toHaveBeenCalled();
});
it("discards a changed draft on cancel and restores focus to the opener", async () => {
  mount();
  const opener = screen.getByRole("button", { name: "Customize dashboard" });
  fireEvent.click(opener);
  const modal = await screen.findByRole("dialog", { name: "Customize dashboard" });
  fireEvent.click(within(modal).getAllByRole("switch")[0]);
  fireEvent.click(within(modal).getByRole("button", { name: "Cancel" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(actions.save).not.toHaveBeenCalled();
  await waitFor(() => expect(opener).toHaveFocus());
});

it("shows a default-save failure after successfully saving the layout", async () => {
  actions.save.mockResolvedValue({ ok: true, value: { ...preference, revision: 8 } });
  actions.setDefault.mockResolvedValue({ ok: false, error: { status: 500 } });
  mount();
  fireEvent.click(screen.getByRole("button", { name: "Customize dashboard" }));
  const modal = await screen.findByRole("dialog", { name: "Customize dashboard" });
  fireEvent.click(within(modal).getAllByRole("switch")[0]);
  fireEvent.click(within(modal).getByRole("button", { name: /^Save$/ }));
  await within(modal).findByText("Display preferences saved.");
  const setDefault = within(modal).getByRole("button", { name: "Set as my default" });
  await waitFor(() => expect(setDefault).toBeEnabled());
  fireEvent.click(setDefault);
  await within(modal).findByText("Could not save. Your draft and previous default are preserved.");
  expect(actions.setDefault).toHaveBeenCalledExactlyOnceWith({
    projectId: preference.projectId,
    expectedRevision: 8,
    preset: "local",
  });
});
