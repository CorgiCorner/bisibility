import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { KeywordsGridDialogBundle } from "./KeywordsGridDialogBundle";

vi.mock("./KeywordsGridDialogs", () => ({
  KeywordsGridDialogs: ({
    addDraft,
    initialMarketKeys,
    onCloseAdd,
    onExitedAdd,
  }: {
    addDraft: { open: boolean };
    initialMarketKeys?: string[];
    onCloseAdd: () => void;
    onExitedAdd?: () => void;
  }) => (
    <div data-testid="market-selection" data-keys={initialMarketKeys?.join(",")}>
      <button onClick={onCloseAdd} type="button">
        close-add
      </button>
      <button onClick={onExitedAdd} type="button">
        exited-add
      </button>
      <span data-open={addDraft.open ? "true" : "false"} data-testid="add-drawer-state" />
    </div>
  ),
}));

vi.mock("./RunChecksConfirmationModal", () => ({
  RunChecksConfirmationModal: () => null,
}));

vi.mock("./useRankTrackerCommands", () => ({
  RankTrackerCommandMarker: () => null,
}));

const baseProps = {
  addDraft: { keyword: "", open: false, tab: "manual" as const },
  addKeywordsAction: vi.fn(),
  canCreateKeyword: true,
  canUpdateKeyword: true,
  checkHealth: undefined,
  closeRunChecks: vi.fn(),
  confirmRunChecks: vi.fn(),
  costContext: undefined,
  exportTarget: null,
  getFirstCheckRunPlanAction: vi.fn(),
  initialAction: null,
  keywordDefaults: undefined,
  onExport: vi.fn(),
  onFilter: vi.fn(),
  onImport: vi.fn(),
  onRunChecks: vi.fn(),
  openAddDrawer: vi.fn(),
  pendingRows: 0,
  preflightDialog: null,
  projectId: "prj_1",
  projectMarkets: undefined,
  queueFirstChecksAction: vi.fn(),
  requestRows: [],
  retryRunChecks: vi.fn(),
  runChecksFlow: null,
  setAddDraft: vi.fn(),
  setExportTarget: vi.fn(),
  tagSuggestions: [],
};

describe("KeywordsGridDialogBundle", () => {
  it("keeps the add drawer mounted while closed so exit motion can finish", () => {
    render(<KeywordsGridDialogBundle {...baseProps} />);
    expect(screen.getByTestId("add-drawer-state")).toHaveAttribute("data-open", "false");
  });

  it("does not unmount the add drawer when open becomes false", () => {
    const { rerender } = render(
      <KeywordsGridDialogBundle
        {...baseProps}
        addDraft={{ keyword: "", open: true, tab: "manual" }}
      />,
    );
    expect(screen.getByTestId("add-drawer-state")).toHaveAttribute("data-open", "true");

    rerender(
      <KeywordsGridDialogBundle
        {...baseProps}
        addDraft={{ keyword: "", open: false, tab: "manual" }}
      />,
    );
    expect(screen.getByTestId("add-drawer-state")).toBeInTheDocument();
    expect(screen.getByTestId("add-drawer-state")).toHaveAttribute("data-open", "false");
  });
});

it("passes the current market to the keyword drawer", () => {
  render(
    <KeywordsGridDialogBundle
      {...baseProps}
      marketScope={{ canonicalKey: "ES", label: "Spain", ref: "pmkt_es", status: "paused" }}
    />,
  );
  expect(screen.getByTestId("market-selection")).toHaveAttribute("data-keys", "ES");
});
