import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { CommandPaletteProvider, CommandPaletteTrigger, useCommandPalette } from "./CommandPalette";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  run: vi.fn(async () => undefined),
  search: vi.fn(),
  setMode: vi.fn(),
}));

type MockGroup = { items: unknown[]; title: string };

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock("@mui/material/styles", () => ({ useColorScheme: () => ({ setMode: mocks.setMode }) }));
vi.mock("@mui/material/Tooltip", () => ({
  default: ({ children, title }: { children: ReactNode; title: string }) => (
    <span data-tooltip={title}>{children}</span>
  ),
}));
vi.mock("./keyword-command-actions", () => ({ KeywordCommandActionBridge: () => null }));
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
  filterGroups: (groups: MockGroup[], query: string) =>
    query === "missing" ? groups.map((group: MockGroup) => ({ ...group, items: [] })) : groups,
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

describe("CommandPalette", () => {
  it("opens from the trigger, searches, runs an item, and closes", async () => {
    render(
      <CommandPaletteProvider projectId="project_1" projectRef="prj_1">
        <Controls />
      </CommandPaletteProvider>,
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    const trigger = screen.getByRole("button", { name: "Search" });
    expect(trigger).toHaveClass("h-[38px]", "w-[38px]", "place-items-center");
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
});
