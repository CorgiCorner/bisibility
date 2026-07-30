import { ProjectWriteModeProvider } from "@/components/shell/ProjectWriteModeProvider";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { KeywordHeaderActions } from "./KeywordHeaderActions";

function renderActions(
  overrides: Partial<Parameters<typeof KeywordHeaderActions>[0]> = {},
  writeMode: "active" | "migration_hold" = "active",
) {
  const handlers = {
    onCreateAlert: vi.fn(),
    onExport: vi.fn(),
    onRunCheck: vi.fn(),
    onToggleEdit: vi.fn(),
  };
  render(
    <ProjectWriteModeProvider projectRef="prj_1" writeMode={writeMode}>
      <KeywordHeaderActions
        alertCreated={false}
        alertCreating={false}
        canCreateAlert
        canUpdateKeyword
        editing={false}
        effectiveDepth={50}
        runPending={false}
        {...handlers}
        {...overrides}
      />
    </ProjectWriteModeProvider>,
  );
  return handlers;
}

describe("KeywordHeaderActions", () => {
  it("runs every available action", () => {
    const handlers = renderActions();
    fireEvent.click(screen.getByRole("button", { name: "Add alert" }));
    fireEvent.click(screen.getByRole("button", { name: "Export CSV" }));
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.click(screen.getByRole("button", { name: "Check now (Top 50)" }));
    expect(handlers.onCreateAlert).toHaveBeenCalledOnce();
    expect(handlers.onExport).toHaveBeenCalledOnce();
    expect(handlers.onToggleEdit).toHaveBeenCalledOnce();
    expect(handlers.onRunCheck).toHaveBeenCalledWith(50);
  });

  it("selects a depth before running it from the primary split button", () => {
    const handlers = renderActions({ effectiveDepth: 100 });

    fireEvent.click(screen.getByRole("button", { name: "Choose check depth" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Top 20" }));

    expect(handlers.onRunCheck).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Check now (Top 20)" }));
    expect(handlers.onRunCheck).toHaveBeenCalledWith(20);
  });

  it("shows exact zero-cost estimates on the action and every depth option", () => {
    renderActions({
      effectiveDepth: 100,
      providerRate: { overrideCents: 0, providerId: "local-sequence" },
    });

    expect(screen.getByRole("button", { name: "Check now (Top 100 · $0.00)" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Choose check depth" }));
    for (const depth of [10, 20, 50, 100]) {
      expect(screen.getByRole("menuitem", { name: `Top ${depth} · $0.00` })).toBeInTheDocument();
    }
  });

  it("marks the selected depth in the menu", () => {
    renderActions({ effectiveDepth: 50 });

    fireEvent.click(screen.getByRole("button", { name: "Choose check depth" }));

    expect(screen.getByRole("menuitem", { name: "Top 50" }).querySelector("svg")).not.toBeNull();
    expect(screen.getByRole("menuitem", { name: "Top 20" }).querySelector("svg")).toBeNull();
  });

  it("resets a manual selection when the effective schedule depth changes", () => {
    const handlers = {
      onCreateAlert: vi.fn(),
      onExport: vi.fn(),
      onRunCheck: vi.fn(),
      onToggleEdit: vi.fn(),
    };
    const props = {
      alertCreated: false,
      alertCreating: false,
      canCreateAlert: true,
      canUpdateKeyword: true,
      editing: false,
      effectiveDepth: 50 as const,
      runPending: false,
      ...handlers,
    };
    const { rerender } = render(
      <ProjectWriteModeProvider projectRef="prj_1" writeMode="active">
        <KeywordHeaderActions {...props} />
      </ProjectWriteModeProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Choose check depth" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Top 20" }));
    expect(screen.getByRole("button", { name: "Check now (Top 20)" })).toBeInTheDocument();

    rerender(
      <ProjectWriteModeProvider projectRef="prj_1" writeMode="active">
        <KeywordHeaderActions {...props} effectiveDepth={100} />
      </ProjectWriteModeProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Check now (Top 100)" }));
    expect(handlers.onRunCheck).toHaveBeenCalledWith(100);
  });

  it("renders created, creating, editing, and pending states", () => {
    const view = renderActions({ alertCreated: true, editing: true, runPending: true });
    expect(screen.getByRole("button", { name: "Alert on" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Close edit" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Starting..." })).toBeDisabled();
    expect(view.onCreateAlert).not.toHaveBeenCalled();
  });

  it("disables alert creation while creating or unavailable", () => {
    const { rerender } = render(
      <ProjectWriteModeProvider projectRef="prj_1" writeMode="active">
        <KeywordHeaderActions
          alertCreated={false}
          alertCreating
          canCreateAlert
          canUpdateKeyword
          editing={false}
          effectiveDepth={100}
          onCreateAlert={vi.fn()}
          onExport={vi.fn()}
          onRunCheck={vi.fn()}
          onToggleEdit={vi.fn()}
          runPending={false}
        />
      </ProjectWriteModeProvider>,
    );
    expect(screen.getByRole("button", { name: "Adding..." })).toBeDisabled();
    rerender(
      <ProjectWriteModeProvider projectRef="prj_1" writeMode="active">
        <KeywordHeaderActions
          alertCreated={false}
          alertCreating={false}
          canCreateAlert={false}
          canUpdateKeyword
          editing={false}
          effectiveDepth={100}
          onCreateAlert={vi.fn()}
          onExport={vi.fn()}
          onRunCheck={vi.fn()}
          onToggleEdit={vi.fn()}
          runPending={false}
        />
      </ProjectWriteModeProvider>,
    );
    expect(screen.getByRole("button", { name: "Add alert" })).toBeDisabled();
  });

  it("blocks writes in migration hold but keeps exports available", () => {
    renderActions({}, "migration_hold");
    expect(screen.getByRole("button", { name: "Add alert" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Edit" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Check now (Top 50)" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Choose check depth" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Export CSV" })).toBeEnabled();
  });
});
