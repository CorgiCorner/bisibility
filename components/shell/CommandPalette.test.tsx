import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { CommandPaletteProvider, CommandPaletteTrigger, useCommandPalette } from "./CommandPalette";
import { type RegisteredCommand, useRegisterCommands } from "./command-registry";

const mocks = vi.hoisted(() => ({
  run: vi.fn(async () => undefined),
  search: vi.fn(),
  setMode: vi.fn(),
}));

type MockItem = { label: string; hint?: string; icon?: unknown; id?: string; run?: () => void };
type MockGroup = { items: MockItem[]; title: string };

vi.mock("@mui/material/styles", () => ({ useColorScheme: () => ({ setMode: mocks.setMode }) }));
vi.mock("@mui/material/Tooltip", () => ({
  default: ({ children, title }: { children: ReactNode; title: string }) => (
    <span data-tooltip={title}>{children}</span>
  ),
}));
vi.mock("./use-keyword-search", () => ({
  useKeywordSearch: () => ({ keywordHits: [], search: mocks.search }),
}));
vi.mock("./command-palette-groups", () => ({
  commandGroups: () => [
    {
      items: [
        {
          hint: "Open",
          icon: () => <span>icon</span>,
          label: "Open overview",
          run: mocks.run,
        },
      ],
      title: "Navigation",
    },
  ],
  filterGroups: (groups: MockGroup[], query: string) => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return groups;
    return groups
      .map((group) => ({
        ...group,
        items: group.items.filter((item) => item.label.toLowerCase().includes(normalized)),
      }))
      .filter((group) => group.items.length > 0);
  },
}));

function Controls() {
  const palette = useCommandPalette();
  return (
    <>
      <CommandPaletteTrigger />
      <button onClick={palette.togglePalette} type="button">
        Toggle
      </button>
      <button onClick={palette.closePalette} type="button">
        Close context
      </button>
    </>
  );
}

function RegistrationMarker({ commands }: { commands: RegisteredCommand[] }) {
  const ref = useRegisterCommands(commands);
  return <span ref={ref} hidden aria-hidden data-testid="marker" />;
}

describe("CommandPalette", () => {
  it("opens from the trigger, searches, runs an item, and closes", async () => {
    render(
      <CommandPaletteProvider projectId="project_1" projectRef="prj_1">
        <Controls />
      </CommandPaletteProvider>,
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    const trigger = screen.getByRole("button", { name: "Search" });
    expect(trigger).toHaveClass("h-8", "w-8", "place-items-center");
    expect(trigger.parentElement).toHaveAttribute("data-tooltip", "Search (⌘K)");
    expect(screen.queryByText("Search…")).not.toBeInTheDocument();
    expect(screen.queryByText("⌘K")).not.toBeInTheDocument();
    fireEvent.click(trigger);
    expect(screen.getByRole("dialog", { name: "Command palette" })).toBeInTheDocument();

    const searchInput = screen.getByPlaceholderText(/Search keywords/);
    expect(searchInput).toHaveClass("focus-visible:outline-none");
    expect(searchInput.parentElement).toHaveClass("focus-within:border-accent");

    fireEvent.change(searchInput, { target: { value: "open" } });
    expect(mocks.search).toHaveBeenCalledWith("open");
    fireEvent.click(screen.getByRole("button", { name: /Open overview/ }));
    expect(mocks.run).toHaveBeenCalledOnce();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("renders empty results and closes via Escape and backdrop", () => {
    render(
      <CommandPaletteProvider defaultOpen projectId="project_1" projectRef="prj_1">
        <Controls />
      </CommandPaletteProvider>,
    );
    fireEvent.change(screen.getByPlaceholderText(/Search keywords/), {
      target: { value: "missing" },
    });
    expect(screen.getByText("No matches")).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Toggle" }));
    const backdrop = document.querySelector('[aria-label="Close command palette"]');
    expect(backdrop).not.toBeNull();
    fireEvent.click(backdrop as HTMLButtonElement);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("supports context toggle and close controls", () => {
    render(
      <CommandPaletteProvider projectId="project_1" projectRef="prj_1">
        <Controls />
      </CommandPaletteProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Toggle" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Close context" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("does not show On this page without registrations", () => {
    render(
      <CommandPaletteProvider defaultOpen projectId="project_1" projectRef="prj_1">
        <Controls />
      </CommandPaletteProvider>,
    );
    expect(screen.queryByText(/on this page/i)).not.toBeInTheDocument();
  });

  it("shows On this page first with hints, filters by label, and closes before running", () => {
    const runAdd = vi.fn();
    const runExport = vi.fn();
    const commands: RegisteredCommand[] = [
      {
        id: "rt-add",
        label: "Add keyword",
        scope: "rank-tracker",
        hint: "New keyword",
        run: runAdd,
      },
      {
        id: "rt-export",
        label: "Export keywords",
        scope: "rank-tracker",
        hint: "Download file",
        run: runExport,
      },
    ];

    render(
      <CommandPaletteProvider defaultOpen projectId="project_1" projectRef="prj_1">
        <Controls />
        <RegistrationMarker commands={commands} />
      </CommandPaletteProvider>,
    );

    const headings = screen.getAllByText(/on this page|navigation/i);
    expect(headings[0].textContent).toMatch(/on this page/i);
    expect(screen.getByText("Add keyword")).toBeInTheDocument();
    expect(screen.getByText("New keyword")).toBeInTheDocument();
    expect(screen.getByText("Export keywords")).toBeInTheDocument();
    expect(screen.getByText("Download file")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Add keyword/ }));
    expect(runAdd).toHaveBeenCalledOnce();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("runs duplicate-label commands independently by stable id", () => {
    const runA = vi.fn();
    const runB = vi.fn();
    const commands: RegisteredCommand[] = [
      { id: "dup-a", label: "Duplicate", scope: "page", hint: "Hint A", run: runA },
      { id: "dup-b", label: "Duplicate", scope: "page", hint: "Hint B", run: runB },
    ];

    render(
      <CommandPaletteProvider defaultOpen projectId="project_1" projectRef="prj_1">
        <Controls />
        <RegistrationMarker commands={commands} />
      </CommandPaletteProvider>,
    );

    const buttons = screen.getAllByRole("button", { name: /Duplicate/ });
    expect(buttons).toHaveLength(2);
    expect(screen.getByText("Hint A")).toBeInTheDocument();
    expect(screen.getByText("Hint B")).toBeInTheDocument();

    fireEvent.click(buttons[0]);
    expect(runA).toHaveBeenCalledOnce();
    expect(runB).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    const reopened = screen.getAllByRole("button", { name: /Duplicate/ });
    expect(reopened).toHaveLength(2);
    fireEvent.click(reopened[1]);
    expect(runB).toHaveBeenCalledOnce();
    expect(runA).toHaveBeenCalledOnce();
  });

  it("filters registered commands by contextual label", () => {
    const commands: RegisteredCommand[] = [
      {
        id: "rt-add",
        label: "Add keyword",
        scope: "rank-tracker",
        hint: "New keyword",
        run: vi.fn(),
      },
      {
        id: "rt-export",
        label: "Export keywords",
        scope: "rank-tracker",
        hint: "Download file",
        run: vi.fn(),
      },
    ];

    render(
      <CommandPaletteProvider defaultOpen projectId="project_1" projectRef="prj_1">
        <Controls />
        <RegistrationMarker commands={commands} />
      </CommandPaletteProvider>,
    );

    fireEvent.change(screen.getByPlaceholderText(/Search keywords/), {
      target: { value: "export" },
    });

    expect(screen.queryByText("Add keyword")).not.toBeInTheDocument();
    expect(screen.getByText("Export keywords")).toBeInTheDocument();
  });
});
