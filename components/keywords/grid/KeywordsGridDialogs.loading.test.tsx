import { render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ loadAdd: vi.fn(), loadExport: vi.fn() }));

vi.mock("@/components/keywords/add/AddKeywordDrawer", () => {
  mocks.loadAdd();
  return {
    AddKeywordDrawer: ({ open }: { open: boolean }) => (
      <div data-open={String(open)} data-testid="add-keyword-form" />
    ),
  };
});
vi.mock("@/components/keywords/export/ExportModal", () => {
  mocks.loadExport();
  return { ExportModal: () => <div data-testid="keyword-export-form" /> };
});

it("loads each form on demand and retains the add drawer through its exit", async () => {
  const { KeywordsGridDialogs } = await import("./KeywordsGridDialogs");
  const props: ComponentProps<typeof KeywordsGridDialogs> = {
    addDraft: { keyword: "", open: false, tab: "manual" },
    addKeywordsAction: vi.fn(),
    exportTarget: null,
    onCloseAdd: vi.fn(),
    onCloseExport: vi.fn(),
    projectId: "prj_1",
    rows: [],
    tagSuggestions: [],
  };
  const { rerender } = render(<KeywordsGridDialogs {...props} />);
  expect(mocks.loadAdd).not.toHaveBeenCalled();
  expect(mocks.loadExport).not.toHaveBeenCalled();
  expect(screen.queryByTestId("add-keyword-form")).toBeNull();

  rerender(<KeywordsGridDialogs {...props} addDraft={{ ...props.addDraft, open: true }} />);
  expect(await screen.findByTestId("add-keyword-form")).toHaveAttribute("data-open", "true");
  expect(mocks.loadAdd).toHaveBeenCalledOnce();
  expect(mocks.loadExport).not.toHaveBeenCalled();

  rerender(<KeywordsGridDialogs {...props} />);
  expect(screen.getByTestId("add-keyword-form")).toHaveAttribute("data-open", "false");

  rerender(
    <KeywordsGridDialogs
      {...props}
      exportTarget={{ count: 1, selection: { keywordIds: ["kw_1"], mode: "selected" } }}
    />,
  );
  expect(await screen.findByTestId("keyword-export-form")).toBeInTheDocument();
  expect(mocks.loadExport).toHaveBeenCalledOnce();
  rerender(<KeywordsGridDialogs {...props} />);
  expect(screen.queryByTestId("keyword-export-form")).toBeNull();
});
