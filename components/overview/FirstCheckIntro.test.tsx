import { ProjectDashboardMessages } from "@/components/overview/ProjectDashboardMessages";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { FirstCheckIntro } from "./FirstCheckIntro";

beforeEach(() => window.localStorage.clear());

it("floats outside a transformed page without starting a check", () => {
  const run = vi.fn();
  const { container } = render(
    <ProjectDashboardMessages>
      <div style={{ transform: "translateX(0)" }}>
        <FirstCheckIntro
          action={
            <button type="button" onClick={run}>
              Start check
            </button>
          }
          projectId="project"
        />
      </div>
    </ProjectDashboardMessages>,
  );
  const intro = screen.getByRole("region", { name: "Run your first check" });
  expect(container).not.toContainElement(intro);
  expect(document.body).toContainElement(intro);
  expect(intro.closest("[data-floating-intro-stack]")).not.toBeNull();
  expect(run).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Start check" }));
  expect(run).toHaveBeenCalledOnce();
});

it("dismisses the portal per project across remounts without starting work", () => {
  const run = vi.fn();
  const mount = (projectId: string) =>
    render(
      <ProjectDashboardMessages>
        <FirstCheckIntro
          action={
            <button type="button" onClick={run}>
              Start check
            </button>
          }
          projectId={projectId}
        />
      </ProjectDashboardMessages>,
    );
  const first = mount("project-one");
  fireEvent.click(screen.getByRole("button", { name: "Dismiss this introduction" }));
  expect(document.querySelector("[data-floating-intro-stack]")).toBeNull();
  first.unmount();
  const again = mount("project-one");
  expect(document.querySelector("[data-floating-intro-stack]")).toBeNull();
  again.unmount();
  mount("project-two");
  expect(screen.getByRole("region", { name: "Run your first check" })).toBeVisible();
  expect(run).not.toHaveBeenCalled();
});

it("can dismiss for this visit when persistent storage is unavailable", () => {
  const get = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
    throw new Error("blocked");
  });
  const set = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("blocked");
  });
  render(
    <ProjectDashboardMessages>
      <FirstCheckIntro action={<button type="button">Start check</button>} projectId="blocked" />
    </ProjectDashboardMessages>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Dismiss this introduction" }));
  expect(document.querySelector("[data-floating-intro-stack]")).toBeNull();
  get.mockRestore();
  set.mockRestore();
});

it("keeps the project intro when dashboard content rerenders", () => {
  const view = (page: number) => (
    <ProjectDashboardMessages>
      <span>Page {page}</span>
      <FirstCheckIntro
        action={<button type="button">Start check</button>}
        projectId="same-project"
      />
    </ProjectDashboardMessages>
  );
  const { rerender } = render(view(1));
  const intro = screen.getByRole("region", { name: "Run your first check" });
  rerender(view(2));
  expect(screen.getByRole("region", { name: "Run your first check" })).toBe(intro);
  expect(intro.closest("[data-floating-intro-stack]")?.parentElement).toBe(document.body);
});
