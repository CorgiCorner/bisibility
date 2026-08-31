import { mockWorkspaces } from "@/components/shell/workspaces.mock";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { WorkspaceSwitcher } from "./WorkspaceSwitcher";

vi.mock("@/components/ui/Tooltip", () => import("@/tests/mui-tooltip"));

describe("WorkspaceSwitcher", () => {
  it.each([true, false])(
    "renders project creation when the actor-owned capability is %s",
    async (canCreateWorkspace) => {
      render(
        <WorkspaceSwitcher
          activeProjectId={mockWorkspaces[0].id}
          canCreateWorkspace={canCreateWorkspace}
          workspaces={mockWorkspaces}
        />,
      );

      fireEvent.click(screen.getByRole("button", { name: "Switch project" }));
      await screen.findByRole("menu", { name: "Projects" });

      expect(screen.getAllByText(mockWorkspaces[0].name).length).toBeGreaterThan(0);
      expect(Boolean(screen.queryByRole("menuitem", { name: "Create project" }))).toBe(
        canCreateWorkspace,
      );
      expect(Boolean(screen.queryByText("Collaborate with others in a new project"))).toBe(
        canCreateWorkspace,
      );
      // The rail already carries Settings and it points at this same screen. The switcher is
      // for changing project, not a second door into the same page.
      expect(screen.queryByRole("menuitem", { name: "Project settings" })).toBeNull();
      expect(
        screen.getByRole("menuitem", { name: new RegExp(mockWorkspaces[1].name) }),
      ).toHaveAttribute("href", `/app/${mockWorkspaces[1].publicId}/dashboard`);
    },
  );

  it("renders the search header and Escape hint", async () => {
    render(
      <WorkspaceSwitcher
        activeProjectId={mockWorkspaces[0].id}
        canCreateWorkspace
        workspaces={mockWorkspaces}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Switch project" }));

    const search = await screen.findByPlaceholderText("Find project...");
    expect(search).toHaveAttribute("type", "search");
    expect(search).toHaveClass("[&::-webkit-search-cancel-button]:hidden");
    expect(search).toHaveFocus();
    expect(search.parentElement).not.toHaveAttribute("tabindex");
    expect(screen.getByText("Esc")).toBeInTheDocument();
  });

  it("filters projects case-insensitively by name and domain", async () => {
    render(
      <WorkspaceSwitcher
        activeProjectId={mockWorkspaces[0].id}
        canCreateWorkspace
        workspaces={mockWorkspaces}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Switch project" }));
    const search = await screen.findByPlaceholderText("Find project...");

    fireEvent.change(search, { target: { value: "vEgA lAbS" } });
    expect(screen.getByRole("menuitem", { name: /Vega Labs/ })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: /newsite\.dev/ })).toBeNull();

    fireEvent.change(search, { target: { value: "LABS.COM" } });
    expect(screen.getByRole("menuitem", { name: /Vega Labs/ })).toBeInTheDocument();
  });

  it("shows the empty project copy while keeping Create project available", async () => {
    render(
      <WorkspaceSwitcher
        activeProjectId={mockWorkspaces[0].id}
        canCreateWorkspace
        workspaces={mockWorkspaces}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Switch project" }));
    fireEvent.change(await screen.findByPlaceholderText("Find project..."), {
      target: { value: "no matching project" },
    });

    expect(
      screen.getByText("Projects you create and join appear here for quick context switching."),
    ).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Create project" })).toBeInTheDocument();
  });

  it("closes with Escape from search and resets the query before reopening", async () => {
    render(
      <WorkspaceSwitcher
        activeProjectId={mockWorkspaces[0].id}
        canCreateWorkspace
        workspaces={mockWorkspaces}
      />,
    );

    const trigger = screen.getByRole("button", { name: "Switch project" });
    fireEvent.click(trigger);
    const search = await screen.findByPlaceholderText("Find project...");
    fireEvent.change(search, { target: { value: "vega" } });
    fireEvent.keyDown(search, { key: "Escape" });

    await waitFor(() => {
      expect(screen.queryByRole("menu", { name: "Projects" })).toBeNull();
    });

    fireEvent.click(trigger);
    expect(await screen.findByPlaceholderText("Find project...")).toHaveValue("");
    expect(screen.getByRole("menuitem", { name: /newsite\.dev/ })).toBeInTheDocument();
  });

  it("keeps an unbordered 30px alignment slot for the create-project icon", async () => {
    render(
      <WorkspaceSwitcher
        activeProjectId={mockWorkspaces[0].id}
        canCreateWorkspace
        workspaces={mockWorkspaces}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Switch project" }));
    const createItem = await screen.findByRole("menuitem", { name: "Create project" });
    const iconSlot = createItem.querySelector("svg")?.parentElement;

    expect(iconSlot).toHaveClass("h-[30px]", "w-[30px]", "text-fg-muted");
    expect(iconSlot).not.toHaveClass("border", "border-dashed", "border-border");
  });

  it("runs the create-project divider edge to edge while retaining vertical spacing", async () => {
    render(
      <WorkspaceSwitcher
        activeProjectId={mockWorkspaces[0].id}
        canCreateWorkspace
        workspaces={mockWorkspaces}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Switch project" }));
    const divider = await screen.findByRole("separator");

    expect(divider).toHaveStyle({
      marginBottom: "4px",
      marginLeft: "-6px",
      marginRight: "-6px",
      marginTop: "4px",
    });
  });

  it("uses a square trigger with equal padding when the sidebar is collapsed", () => {
    render(
      <WorkspaceSwitcher
        activeProjectId={mockWorkspaces[0].id}
        canCreateWorkspace
        collapsed
        workspaces={mockWorkspaces}
      />,
    );

    const trigger = screen.getByRole("button", { name: "Switch project" });
    expect(trigger).toHaveClass("size-9", "p-0", "justify-center");
    expect(trigger).not.toHaveClass("w-full", "h-11");
  });

  it("keeps the expanded trigger at the collapsed square height", () => {
    render(
      <WorkspaceSwitcher
        activeProjectId={mockWorkspaces[0].id}
        canCreateWorkspace
        compact
        workspaces={mockWorkspaces}
      />,
    );

    const trigger = screen.getByRole("button", { name: "Switch project" });
    expect(trigger).toHaveClass("h-9", "w-full");
    expect(trigger).not.toHaveClass("h-11");
  });

  it("uses the sunken hover surface on the expanded sidebar trigger", () => {
    render(
      <WorkspaceSwitcher
        activeProjectId={mockWorkspaces[0].id}
        canCreateWorkspace
        workspaces={mockWorkspaces}
      />,
    );

    const trigger = screen.getByRole("button", { name: "Switch project" });

    expect(trigger).toHaveClass("hover:bg-bg-sunken");
    expect(trigger).not.toHaveClass("hover:bg-nav-active");
  });

  it("reserves the full available sidebar width when expanded", () => {
    render(
      <WorkspaceSwitcher
        activeProjectId={mockWorkspaces[0].id}
        canCreateWorkspace
        workspaces={mockWorkspaces}
      />,
    );

    const trigger = screen.getByRole("button", { name: "Switch project" });

    expect(trigger.closest("[data-tooltip]")).toHaveClass("w-full");
  });

  it("suppresses the expanded trigger tooltip", () => {
    render(
      <WorkspaceSwitcher
        activeProjectId={mockWorkspaces[0].id}
        canCreateWorkspace
        workspaces={mockWorkspaces}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Switch project" }).closest("[data-tooltip]"),
    ).toHaveAttribute("data-tooltip", "");
  });

  it("keeps the trigger transparent in the default ghost variant and boxed on request", () => {
    const { rerender } = render(
      <WorkspaceSwitcher
        activeProjectId={mockWorkspaces[0].id}
        canCreateWorkspace
        workspaces={mockWorkspaces}
      />,
    );

    expect(screen.getByRole("button", { name: "Switch project" }).className).toContain(
      "border-transparent",
    );

    rerender(
      <WorkspaceSwitcher
        activeProjectId={mockWorkspaces[0].id}
        canCreateWorkspace
        variant="boxed"
        workspaces={mockWorkspaces}
      />,
    );

    const trigger = screen.getByRole("button", { name: "Switch project" });
    expect(trigger.className).toContain("border-border-control");
    expect(trigger.className).toContain("bg-bg-elev");
  });

  it("uses a compact 20px workspace favicon in the sidebar trigger", () => {
    render(
      <WorkspaceSwitcher
        activeProjectId={mockWorkspaces[0].id}
        canCreateWorkspace
        workspaces={mockWorkspaces}
      />,
    );

    const expectElevatedTile = () => {
      const trigger = screen.getByRole("button", { name: "Switch project" });
      const tile = trigger.querySelector("[aria-hidden]");

      expect(tile).toHaveClass("bg-white");
      expect(tile).not.toHaveClass("bg-bg-sunken");
    };

    expectElevatedTile();
    expect(
      screen.getByRole("button", { name: "Switch project" }).querySelector("[aria-hidden]"),
    ).toHaveClass("h-5", "w-5");
  });

  it("aligns a compact header favicon to the navigation icon axis", () => {
    render(
      <WorkspaceSwitcher
        activeProjectId={mockWorkspaces[0].id}
        canCreateWorkspace
        compact
        workspaces={mockWorkspaces}
      />,
    );

    expect(screen.getByRole("button", { name: "Switch project" })).toHaveClass("px-[5px]");
  });

  it("shows the workspace tile in the trigger without encoding selection", () => {
    render(
      <WorkspaceSwitcher
        activeProjectId={mockWorkspaces[0].id}
        canCreateWorkspace
        workspaces={mockWorkspaces}
      />,
    );

    const trigger = screen.getByRole("button", { name: "Switch project" });
    const tile = trigger.querySelector("[aria-hidden]");
    expect(tile?.textContent).toBe("a");
    expect(tile?.className).not.toContain("accent");
  });

  it("shows an opaque paper instantly and lets Escape only close the menu", async () => {
    render(
      <WorkspaceSwitcher
        activeProjectId={mockWorkspaces[0].id}
        canCreateWorkspace
        workspaces={mockWorkspaces}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Switch project" }));
    const menu = await screen.findByRole("menu", { name: "Projects" });
    const paper = document.querySelector<HTMLElement>(".MuiMenu-paper");

    expect(paper).not.toBeNull();
    const generatedClass = Array.from(paper?.classList ?? []).find((className) =>
      className.endsWith("-MuiPaper-root-MuiPopover-paper-MuiMenu-paper"),
    );
    const paperRule = Array.from(document.styleSheets)
      .flatMap((sheet) => Array.from(sheet.cssRules, (rule) => rule.cssText))
      .find((rule) => generatedClass !== undefined && rule.includes(`.${generatedClass}`));

    expect(paperRule).toContain("background-color: var(--bg-elev)");
    expect(paperRule).toContain("border: 1px solid var(--border-control)");
    expect(paperRule).toContain("box-shadow: none");
    expect(paperRule).toContain("max-width: calc(100vw - 16px)");
    expect(paperRule).toContain("width: 320px");
    expect(paper?.parentElement?.style.opacity).toBe("");
    expect(paper?.parentElement?.style.transform ?? "").not.toMatch(/scale/);
    expect(paper?.style.transition ?? "").not.toMatch(/180ms/);

    fireEvent.keyDown(menu, { key: "Escape" });
    await waitFor(() => {
      expect(screen.queryByRole("menu", { name: "Projects" })).toBeNull();
    });

    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(screen.queryByRole("menu", { name: "Projects" })).toBeNull();
  });

  it("closes on a second trigger click instead of reopening", async () => {
    render(
      <WorkspaceSwitcher
        activeProjectId={mockWorkspaces[0].id}
        canCreateWorkspace
        workspaces={mockWorkspaces}
      />,
    );

    const trigger = screen.getByRole("button", { name: "Switch project" });
    fireEvent.click(trigger);
    await screen.findByRole("menu", { name: "Projects" });
    fireEvent.click(trigger);
    await waitFor(() => {
      expect(screen.queryByRole("menu", { name: "Projects" })).toBeNull();
    });
  });
});
