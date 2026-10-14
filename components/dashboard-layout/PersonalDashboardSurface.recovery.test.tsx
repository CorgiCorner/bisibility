import { renderWithSharedMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import { organicAccess } from "@/lib/dashboard-layout/test-fixtures";
import {
  type DashboardSurfacePreference,
  dashboardLayoutFor,
} from "@/lib/project-surface-preferences/dashboard-model";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PersonalDashboardSurface } from "./PersonalDashboardSurface";

const mocks = vi.hoisted(() => ({
  read: vi.fn(),
  save: vi.fn(),
  setDefault: vi.fn(),
  refresh: vi.fn(),
  replace: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh, replace: mocks.replace }),
  usePathname: () => "/app/project/dashboard",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/project-surface-preferences/dashboard-actions", () => ({
  readDashboardPreference: mocks.read,
  saveDashboardLayout: mocks.save,
  setDashboardDefault: mocks.setDefault,
}));
const initial: DashboardSurfacePreference = {
  projectId: "prj_abcdefghijklmnopqrstuvwx",
  revision: 7,
  defaultPreset: "general",
  presentation: { schemaVersion: 1, layouts: {} },
  notice: { kind: "unsupported_version", scopeUnavailable: true },
};
const fixture = () => ({
  access: { ...organicAccess, projectId: initial.projectId },
  preference: initial,
  layout: dashboardLayoutFor(initial),
  widgets: {},
  shell: {
    scope: "Scope",
    mode: "Display only",
    health: "Unknown health",
    budget: "Unknown budget",
    coverage: "Unknown coverage",
  },
});
describe("unsupported dashboard layout explicit recovery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.read.mockResolvedValue({ ok: true, value: initial });
  });
  it("preserves an unsaved draft, never writes on reload, and requires a newer compatible revision before explicit review", async () => {
    render(<PersonalDashboardSurface {...fixture()} />);
    fireEvent.click(screen.getByRole("button", { name: "Customize dashboard" }));
    fireEvent.click(screen.getByRole("switch", { name: "Organic metrics" }));
    expect(
      screen.getByText("Unsaved layout draft. The stored layout has not changed."),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: /^Save$/ })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Reload stored layout" }));
    await waitFor(() => expect(mocks.read).toHaveBeenCalledOnce());
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Reload stored layout" })).toBeEnabled(),
    );
    expect(screen.queryByRole("button", { name: "Keep my draft" })).not.toBeInTheDocument();
    expect(mocks.save).not.toHaveBeenCalled();
    expect(mocks.setDefault).not.toHaveBeenCalled();
    mocks.read.mockResolvedValue({
      ok: true,
      value: { ...initial, revision: 8, notice: undefined },
    });
    fireEvent.click(screen.getByRole("button", { name: "Reload stored layout" }));
    const review = await screen.findByRole("button", { name: "Keep my draft" });
    expect(screen.getByText("Current layout revision: 8")).toBeVisible();
    fireEvent.click(review);
    expect(screen.getByRole("switch", { name: "Organic metrics" })).not.toBeChecked();
    expect(screen.getByRole("button", { name: "Customize dashboard" })).toHaveFocus();
    expect(screen.getByRole("button", { name: /^Save$/ })).toBeEnabled();
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it("shows recovery if a compatible layout becomes unsupported before a save, while keeping the draft", async () => {
    mocks.save.mockResolvedValue({
      ok: false,
      error: { status: 404, code: "saved_view_unavailable" },
    });
    mocks.read.mockResolvedValue({ ok: true, value: { ...initial, revision: 8 } });
    render(
      <PersonalDashboardSurface {...fixture()} preference={{ ...initial, notice: undefined }} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Customize dashboard" }));
    fireEvent.click(screen.getByRole("switch", { name: "Organic metrics" }));
    fireEvent.click(screen.getByRole("button", { name: /^Save$/ }));
    await screen.findByRole("button", { name: "Reload stored layout" });
    expect(screen.getByRole("button", { name: /^Save$/ })).toBeDisabled();
    expect(screen.getByRole("switch", { name: "Organic metrics" })).not.toBeChecked();
    expect(mocks.save).toHaveBeenCalledOnce();
    expect(mocks.setDefault).not.toHaveBeenCalled();
  });
  it("does not accept a same-revision, foreign-project or still unsupported reload as a mutation base", async () => {
    render(<PersonalDashboardSurface {...fixture()} />);
    for (const value of [
      { ...initial, notice: undefined },
      { ...initial, revision: 9 },
      { ...initial, projectId: "prj_bbbbbbbbbbbbbbbbbbbbbbbb", revision: 9, notice: undefined },
    ]) {
      mocks.read.mockResolvedValue({ ok: true, value });
      fireEvent.click(screen.getByRole("button", { name: "Reload stored layout" }));
      await waitFor(() =>
        expect(screen.getByRole("button", { name: "Reload stored layout" })).toBeEnabled(),
      );
      expect(screen.queryByRole("button", { name: "Keep my draft" })).not.toBeInTheDocument();
    }
    expect(mocks.save).not.toHaveBeenCalled();
    expect(mocks.setDefault).not.toHaveBeenCalled();
  });
  it("closes an unsaved editor with Escape and restores the trigger focus", () => {
    render(<PersonalDashboardSurface {...fixture()} />);
    const trigger = screen.getByRole("button", { name: "Customize dashboard" });
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("switch", { name: "Organic metrics" }));
    expect(
      screen.getByText("Unsaved layout draft. The stored layout has not changed."),
    ).toBeVisible();
    fireEvent.keyDown(screen.getByRole("group", { name: "Customize dashboard" }), {
      key: "Escape",
    });
    expect(screen.queryByRole("button", { name: /^Save$/ })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    expect(mocks.save).not.toHaveBeenCalled();
    expect(
      screen.queryByText("Unsaved layout draft. The stored layout has not changed."),
    ).not.toBeInTheDocument();
    fireEvent.click(trigger);
    expect(screen.getByRole("switch", { name: "Organic metrics" })).toBeVisible();
    expect(screen.getByRole("switch", { name: "Organic metrics" })).toBeChecked();
  });
});
