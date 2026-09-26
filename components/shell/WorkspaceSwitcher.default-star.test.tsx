import { mockWorkspaces } from "@/components/shell/workspaces.mock";
import { ToastContext } from "@/components/ui/toast-context";
import { renderWithShellMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import type { WorkspaceSummary } from "@/lib/queries/workspaces";
import { routerMock } from "@/tests/next-navigation";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WorkspaceSwitcher } from "./WorkspaceSwitcher";

const mocks = vi.hoisted(() => ({ setDefaultProject: vi.fn(), showToast: vi.fn() }));

vi.mock("@/lib/actions/default-project", () => ({ setDefaultProject: mocks.setDefaultProject }));

const [acme, newsite, vega] = mockWorkspaces;

async function openSwitcher(workspaces: WorkspaceSummary[] = mockWorkspaces, canSetDefault = true) {
  render(
    <ToastContext.Provider value={{ showToast: mocks.showToast }}>
      <WorkspaceSwitcher
        activeProjectId={acme.id}
        canCreateWorkspace
        canSetDefault={canSetDefault}
        workspaces={workspaces}
      />
    </ToastContext.Provider>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Switch project" }));
  return screen.findByRole("menu", { name: "Projects" });
}

function star(name: string) {
  return screen.getByRole("button", { name: `Default project: ${name}` });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("WorkspaceSwitcher default project star", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.setDefaultProject.mockResolvedValue({ ok: true, value: { projectId: null } });
  });

  it("offers the star only on onboarded rows and never on locked accounts", async () => {
    await openSwitcher([acme, { ...newsite, onboardingCompletedAt: null }]);

    expect(star(acme.name)).toHaveAttribute("aria-pressed", "false");
    expect(screen.queryByRole("button", { name: `Default project: ${newsite.name}` })).toBeNull();
  });

  it("hides every star when the account cannot set a default", async () => {
    await openSwitcher(mockWorkspaces, false);

    expect(screen.queryByRole("button", { name: /^Default project:/ })).toBeNull();
  });

  it("describes both states with the short tooltip copy", async () => {
    await openSwitcher([acme, { ...vega, isDefault: true }]);

    expect(star(acme.name)).toHaveAccessibleDescription(/Make default project/);
    expect(star(acme.name)).toHaveAccessibleDescription(/Opens first when you sign in\./);
    expect(star(vega.name)).toHaveAttribute("aria-pressed", "true");
    expect(star(vega.name)).toHaveAccessibleDescription(/Default project/);
    expect(star(vega.name)).toHaveAccessibleDescription(
      /Select to stop opening this project first\./,
    );
  });

  it("stars a project optimistically without navigating or closing the menu", async () => {
    const save = deferred<{ ok: true; value: { projectId: string } }>();
    mocks.setDefaultProject.mockReturnValue(save.promise);
    const menu = await openSwitcher();

    fireEvent.click(star(newsite.name));

    expect(star(newsite.name)).toHaveAttribute("aria-pressed", "true");
    expect(mocks.setDefaultProject).toHaveBeenCalledWith({ projectId: newsite.id });
    expect(menu).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: new RegExp(acme.name) })).toBeInTheDocument();
    expect(routerMock.push).not.toHaveBeenCalled();
    expect(routerMock.refresh).not.toHaveBeenCalled();

    save.resolve({ ok: true, value: { projectId: newsite.id } });
    await waitFor(() => expect(routerMock.refresh).toHaveBeenCalledOnce());
    expect(star(newsite.name)).toHaveAttribute("aria-pressed", "true");
    expect(mocks.showToast).not.toHaveBeenCalled();
  });

  it("moves the single default between rows and clears it from the filled star", async () => {
    await openSwitcher([acme, { ...newsite, isDefault: true }]);

    fireEvent.click(star(acme.name));
    expect(star(acme.name)).toHaveAttribute("aria-pressed", "true");
    expect(star(newsite.name)).toHaveAttribute("aria-pressed", "false");
    expect(mocks.setDefaultProject).toHaveBeenLastCalledWith({ projectId: acme.id });

    fireEvent.click(star(acme.name));
    expect(star(acme.name)).toHaveAttribute("aria-pressed", "false");
    expect(mocks.setDefaultProject).toHaveBeenLastCalledWith({ projectId: null });
  });

  it.each([
    ["a handled failure", () => Promise.resolve({ error: { code: "not_found" }, ok: false })],
    ["a thrown action", () => Promise.reject(new Error("offline"))],
  ])("reverts the star and shows an error toast after %s", async (_label, respond) => {
    mocks.setDefaultProject.mockImplementation(respond);
    await openSwitcher();

    fireEvent.click(star(newsite.name));
    expect(star(newsite.name)).toHaveAttribute("aria-pressed", "true");

    await waitFor(() => expect(star(newsite.name)).toHaveAttribute("aria-pressed", "false"));
    expect(mocks.showToast).toHaveBeenCalledWith(
      "Could not update your default project. Please try again.",
      { severity: "error" },
    );
    expect(routerMock.refresh).toHaveBeenCalledOnce();
  });

  it("reaches the star from its row with the arrow keys and returns to the menu order", async () => {
    await openSwitcher();
    const acmeRow = screen.getByRole("menuitem", { name: new RegExp(acme.name) });
    const newsiteRow = screen.getByRole("menuitem", { name: new RegExp(newsite.name) });

    acmeRow.focus();
    fireEvent.keyDown(acmeRow, { key: "ArrowRight" });
    expect(star(acme.name)).toHaveFocus();

    fireEvent.keyDown(star(acme.name), { key: "ArrowLeft" });
    expect(acmeRow).toHaveFocus();

    fireEvent.keyDown(acmeRow, { key: "ArrowRight" });
    fireEvent.keyDown(star(acme.name), { key: "ArrowDown" });
    expect(newsiteRow).toHaveFocus();
  });
});
