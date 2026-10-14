import { OverviewToolbar } from "@/components/overview/OverviewToolbar";
import { renderWithFeatureMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import { organicAccess } from "@/lib/dashboard-layout/test-fixtures";
import {
  type DashboardSurfacePreference,
  dashboardLayoutFor,
} from "@/lib/project-surface-preferences/dashboard-model";
import dashboardMessages from "@/messages/core/en/project-dashboard.json";
import sharedMessages from "@/messages/core/en/shared.json";
import { routerMock, setNavigationState } from "@/tests/next-navigation";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PersonalDashboardSurface } from "./PersonalDashboardSurface";

const actions = vi.hoisted(() => ({ read: vi.fn(), save: vi.fn(), setDefault: vi.fn() }));
vi.mock("@/lib/project-surface-preferences/dashboard-actions", () => ({
  readDashboardPreference: actions.read,
  saveDashboardLayout: actions.save,
  setDashboardDefault: actions.setDefault,
}));
const initial: DashboardSurfacePreference = {
  projectId: "prj_abcdefghijklmnopqrstuvwx",
  revision: 7,
  defaultPreset: "general",
  presentation: { schemaVersion: 1, layouts: {} },
};
function renderSurface({
  preference = initial,
  preset = "general" as "general" | "local",
  authorized = true,
} = {}) {
  return render(
    <PersonalDashboardSurface
      integratedToolbar
      access={{ ...organicAccess, projectId: initial.projectId, projectReadAuthorized: authorized }}
      preference={preference}
      layout={dashboardLayoutFor(preference, preset)}
      widgets={{}}
      shell={{
        scope: <OverviewToolbar placement="inline" projectRef={initial.projectId} />,
        mode: "Display only",
        health: "Unknown health",
        budget: "Unknown budget",
        coverage: "Unknown coverage",
      }}
    />,
    { messages: { ...sharedMessages, ...dashboardMessages } },
  );
}
async function openCustomization() {
  const trigger = screen.getByRole("button", { name: "Customize dashboard" });
  await waitFor(() => expect(trigger).toBeEnabled());
  fireEvent.click(trigger);
  return { trigger, menu: await screen.findByRole("menu", { name: "Customize dashboard" }) };
}
beforeEach(() => {
  vi.clearAllMocks();
  setNavigationState({ pathname: "/app/project/dashboard" });
});

describe("integrated personal dashboard toolbar", () => {
  it("keeps one shared scope with preset, filters and customization in reading order", () => {
    renderSurface();
    const scope = screen.getByRole("region", { name: "Shared search scope" });
    expect(document.querySelectorAll('[data-dashboard-shell="scope"]')).toHaveLength(1);
    expect(document.querySelectorAll("[data-dashboard-shell]")).toHaveLength(5);
    expect(
      within(scope)
        .getAllByRole("button")
        .map((button) => button.getAttribute("aria-label")),
    ).toEqual(["Dashboard preset", "Date range", "Tag", "Customize dashboard"]);
    expect(within(scope).getByRole("link", { name: /Add keyword/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Set as my default" })).not.toBeInTheDocument();
    expect(actions.save).not.toHaveBeenCalled();
    expect(actions.setDefault).not.toHaveBeenCalled();
  });

  it("opens the editor with the menu keyboard action and restores focus after Escape", async () => {
    renderSurface();
    const { trigger, menu } = await openCustomization();
    const edit = within(menu).getByRole("menuitem", { name: "Customize dashboard" });
    edit.focus();
    fireEvent.keyDown(edit, { key: "Enter" });
    await screen.findByRole("switch", { name: "Organic metrics" });
    await waitFor(() => expect(screen.queryByRole("menu")).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole("switch", { name: "Organic metrics" }));
    fireEvent.keyDown(screen.getByRole("group", { name: "Customize dashboard" }), {
      key: "Escape",
    });
    expect(screen.queryByRole("button", { name: /^Save$/ })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    expect(actions.save).not.toHaveBeenCalled();
  });

  it("keeps the default command disabled for the current default", async () => {
    renderSurface();
    const opened = await openCustomization();
    expect(
      within(opened.menu).getByRole("menuitem", { name: "Set as my default" }),
    ).toHaveAttribute("aria-disabled", "true");
    expect(actions.setDefault).not.toHaveBeenCalled();
  });

  it("disables an otherwise available default command and view selection while a draft is unsaved", async () => {
    renderSurface({ preset: "local" });
    const presetControl = screen.getByRole("button", { name: "Dashboard preset" });
    let opened = await openCustomization();
    expect(
      within(opened.menu).getByRole("menuitem", { name: "Set as my default" }),
    ).not.toHaveAttribute("aria-disabled", "true");
    fireEvent.click(within(opened.menu).getByRole("menuitem", { name: "Customize dashboard" }));
    await screen.findByRole("button", { name: /^Save$/ });
    fireEvent.click(screen.getAllByRole("switch")[0]);
    opened = await openCustomization();
    expect(
      within(opened.menu).getByRole("menuitem", { name: "Set as my default" }),
    ).toHaveAttribute("aria-disabled", "true");
    expect(presetControl).toBeDisabled();
    expect(actions.setDefault).not.toHaveBeenCalled();
  });

  it("keeps unsupported preferences from becoming a default through the menu", async () => {
    renderSurface({
      preset: "local",
      preference: { ...initial, notice: { kind: "unsupported_version", scopeUnavailable: true } },
    });
    const { menu } = await openCustomization();
    expect(within(menu).getByRole("menuitem", { name: "Set as my default" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    expect(actions.setDefault).not.toHaveBeenCalled();
  });

  it("reports a revision conflict without replacing the stored default or writing a layout", async () => {
    actions.setDefault.mockResolvedValue({
      ok: false,
      error: { status: 409, code: "preferences_conflict" },
    });
    renderSurface({ preset: "local" });
    const { menu } = await openCustomization();
    fireEvent.click(within(menu).getByRole("menuitem", { name: "Set as my default" }));
    await screen.findByText(
      "Preferences changed elsewhere. Your draft is preserved; review the current layout before saving.",
    );
    expect(actions.save).not.toHaveBeenCalled();
    const reopened = await openCustomization();
    expect(
      within(reopened.menu).getByRole("menuitem", { name: "Set as my default" }),
    ).not.toHaveAttribute("aria-disabled", "true");
  });

  it("saves a different view as the default with the current revision only after explicit selection", async () => {
    actions.setDefault.mockResolvedValue({
      ok: true,
      value: { ...initial, revision: 8, defaultPreset: "local" },
    });
    renderSurface({ preset: "local" });
    const { menu } = await openCustomization();
    expect(actions.setDefault).not.toHaveBeenCalled();
    fireEvent.click(within(menu).getByRole("menuitem", { name: "Set as my default" }));
    await screen.findByText("Your default dashboard is saved.");
    expect(actions.setDefault).toHaveBeenCalledExactlyOnceWith({
      projectId: initial.projectId,
      expectedRevision: 7,
      preset: "local",
    });
  });

  it("preserves the selected dashboard view and other URL filters when changing the period", async () => {
    setNavigationState({
      pathname: "/app/project/dashboard",
      searchParams: { dashboardView: "general", tag: "Docs", device: "mobile" },
    });
    renderSurface();
    fireEvent.click(screen.getByRole("button", { name: "Date range" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Last 7 days" }));
    expect(routerMock.push).toHaveBeenCalledExactlyOnceWith(
      "/app/project/dashboard?dashboardView=general&tag=Docs&device=mobile&range=7d",
    );
  });

  it("reads the selected period and tag from the URL when a host has no measured report", () => {
    setNavigationState({
      pathname: "/app/project/dashboard",
      searchParams: { dashboardView: "local", range: "90d", tag: "Docs" },
    });
    renderSurface({ preset: "local" });
    expect(screen.getByRole("button", { name: "Date range" })).toHaveTextContent("Last 90 days");
    expect(screen.getByRole("button", { name: "Tag" })).toHaveTextContent("Docs");
  });

  it("retains exactly one unavailable scope and suppresses host filters when project access is absent", () => {
    renderSurface({ authorized: false });
    const scope = screen.getByRole("region", { name: "Shared search scope" });
    expect(document.querySelectorAll('[data-dashboard-shell="scope"]')).toHaveLength(1);
    expect(document.querySelectorAll("[data-dashboard-shell]")).toHaveLength(5);
    expect(
      within(scope).getByText("Context is unavailable. This does not mean zero."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Date range" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Add keyword/ })).not.toBeInTheDocument();
    expect(actions.save).not.toHaveBeenCalled();
    expect(actions.setDefault).not.toHaveBeenCalled();
  });
});
