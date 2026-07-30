import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { type ButtonHTMLAttributes, type ReactNode, useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ImportCsvWizard } from "./ImportCsvWizard";
import { KeywordImportProvider, useKeywordImport } from "./KeywordImportProvider";

const mocks = vi.hoisted(() => ({
  importKeywordsFromCsv: vi.fn(),
  onClose: vi.fn(),
  previewKeywordImportFile: vi.fn(),
  refresh: vi.fn(),
  refreshKeywordViewsAfterImport: vi.fn(),
  remountGrid: vi.fn(),
  pathname: vi.fn(() => "/app/keywords"),
}));

type MockButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  endIcon?: ReactNode;
  startIcon?: ReactNode;
  sx?: unknown;
};
type MockSheetProps = {
  children: ReactNode;
  footer: ReactNode;
  onClose: () => void;
  open: boolean;
  title: ReactNode;
};
type UploadMockProps = {
  errorMessage?: string;
  onCsvFileError: (message: string) => void;
  onCsvTextChange: (value: string) => void;
  onUnsupportedFile: () => void;
  onWorkbookFileChange: (file?: File) => void;
};

vi.mock("next/navigation", () => ({
  usePathname: mocks.pathname,
  useRouter: () => ({ refresh: mocks.refresh }),
}));
vi.mock("@/lib/actions/keyword-import-export", () => ({
  importKeywordsFromCsv: mocks.importKeywordsFromCsv,
  previewKeywordImportFile: mocks.previewKeywordImportFile,
}));
vi.mock("@/lib/actions/keyword-import-refresh", () => ({
  refreshKeywordViewsAfterImport: mocks.refreshKeywordViewsAfterImport,
}));
vi.mock("@/components/ui", () => ({
  Button: ({
    children,
    endIcon: _endIcon,
    startIcon: _startIcon,
    sx: _sx,
    ...props
  }: MockButtonProps) => <button {...props}>{children}</button>,
  Sheet: ({ children, footer, onClose, open, title }: MockSheetProps) =>
    open ? (
      <div>
        <div>{title}</div>
        <button onClick={onClose} type="button">
          Close sheet
        </button>
        {children}
        <div>{footer}</div>
      </div>
    ) : null,
}));
vi.mock("./ImportCsvWizardSteps", () => ({
  ImportStepper: ({ step }: { step: number }) => <p>Step {step}</p>,
}));
vi.mock("./ImportCsvWizardPanels", () => ({
  DoneStep: ({
    result,
  }: {
    result: {
      created: number;
      errors: { message: string; row: number }[];
      failed: number;
      skipped: number;
    };
  }) => (
    <div>
      <p>
        {result.created} added, {result.skipped} skipped, {result.failed} failed
      </p>
      {result.errors.map((error) => (
        <p key={error.row}>
          Row {error.row}: {error.message}
        </p>
      ))}
    </div>
  ),
  MapStep: ({
    parsedCount,
    parsedRows,
  }: {
    parsedCount: number | null;
    parsedRows: { keyword: string }[] | null;
  }) => (
    <p>
      Map {parsedCount ?? "workbook"}: {parsedRows?.map((row) => row.keyword).join(", ")}
    </p>
  ),
  ReviewStep: ({
    parsedCount,
    parsedRows,
  }: {
    parsedCount: number | null;
    parsedRows: { keyword: string }[] | null;
  }) => (
    <p>
      Review {parsedCount ?? "workbook"}: {parsedRows?.map((row) => row.keyword).join(", ")}
    </p>
  ),
  TemplateStep: () => <p>Template instructions</p>,
  UploadStep: ({
    errorMessage,
    onCsvFileError,
    onCsvTextChange,
    onUnsupportedFile,
    onWorkbookFileChange,
  }: UploadMockProps) => (
    <div>
      {errorMessage ? <p>{errorMessage}</p> : null}
      <button onClick={() => onCsvTextChange("rank tracker\nseo api")} type="button">
        Paste CSV
      </button>
      <button onClick={() => onCsvTextChange("keyword;country\nrank tracker;PL")} type="button">
        Paste semicolon CSV
      </button>
      <button
        onClick={() =>
          onCsvTextChange(
            ["keyword", ...Array.from({ length: 501 }, () => "duplicate keyword")].join("\n"),
          )
        }
        type="button"
      >
        Paste 501 rows
      </button>
      <button
        onClick={() => onCsvFileError("CSV import files must be UTF-8 encoded.")}
        type="button"
      >
        Invalid encoded CSV
      </button>
      <button onClick={onUnsupportedFile} type="button">
        Unsupported file
      </button>
      <button
        onClick={() =>
          onWorkbookFileChange(
            new File(["workbook"], "keywords.xlsx", {
              type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            }),
          )
        }
        type="button"
      >
        Choose workbook
      </button>
      <button onClick={() => onWorkbookFileChange(undefined)} type="button">
        Empty selection
      </button>
    </div>
  ),
}));

function renderWizard() {
  return render(<ImportCsvWizard onClose={mocks.onClose} open projectId="project_1" />);
}

function ImportLauncher({
  projectId = "project_1",
  rowCount,
}: Readonly<{ projectId?: string; rowCount: number }>) {
  const { openKeywordImport } = useKeywordImport();
  return (
    <div>
      <p>Grid rows: {rowCount}</p>
      <button onClick={() => openKeywordImport(projectId)} type="button">
        Import
      </button>
    </div>
  );
}

function ServerRefreshBoundaryHarness() {
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [rowCount, setRowCount] = useState(0);
  mocks.remountGrid.mockImplementation(() => {
    setRefreshVersion((value) => value + 1);
    setRowCount(1);
  });
  return (
    <KeywordImportProvider>
      <ImportLauncher key={refreshVersion} rowCount={rowCount} />
    </KeywordImportProvider>
  );
}

function continueButton() {
  return screen.findByRole("button", { name: "Continue" });
}

async function reachUpload() {
  fireEvent.click(await continueButton());
  expect(await screen.findByText("Step 2")).toBeInTheDocument();
}

async function reachReviewWithCsv() {
  await reachUpload();
  fireEvent.click(screen.getByRole("button", { name: "Paste CSV" }));
  fireEvent.click(await continueButton());
  expect(await screen.findByText("Map 2: rank tracker, seo api")).toBeInTheDocument();
  fireEvent.click(await continueButton());
  expect(await screen.findByText("Review 2: rank tracker, seo api")).toBeInTheDocument();
}

describe("ImportCsvWizard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.refresh.mockImplementation(() => undefined);
    mocks.refreshKeywordViewsAfterImport.mockResolvedValue(undefined);
    mocks.pathname.mockReturnValue("/app/keywords");
    mocks.importKeywordsFromCsv.mockResolvedValue({
      created: 2,
      errors: [],
      failed: 0,
      skipped: 0,
    });
    mocks.previewKeywordImportFile.mockResolvedValue({
      ok: true,
      rows: [
        { keyword: "rank tracker", row: 2 },
        { keyword: "mobile serp", row: 3 },
      ],
    });
  });

  it("validates an empty upload and unsupported files", async () => {
    renderWizard();
    await reachUpload();

    fireEvent.click(await continueButton());
    expect(
      await screen.findByText("Upload an XLSX workbook or paste CSV rows."),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Unsupported file" }));
    expect(
      await screen.findByText("Choose a CSV or XLSX file. Save legacy .xls files as .xlsx."),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Empty selection" }));
    expect(screen.getByText("Step 2")).toBeInTheDocument();
  });

  it("renders actionable guidance for unsupported CSV delimiters", async () => {
    renderWizard();
    await reachUpload();

    fireEvent.click(screen.getByRole("button", { name: "Paste semicolon CSV" }));

    expect(
      await screen.findByText(
        "This file appears to use semicolons (;) as separators. Export it as comma-separated CSV and try again.",
      ),
    ).toBeInTheDocument();
    fireEvent.click(await continueButton());
    expect(screen.getByText("Step 2")).toBeInTheDocument();
  });

  it("blocks CSV files that fail byte-aware UTF-8 decoding", async () => {
    renderWizard();
    await reachUpload();

    fireEvent.click(screen.getByRole("button", { name: "Invalid encoded CSV" }));

    expect(await screen.findByText("CSV import files must be UTF-8 encoded.")).toBeInTheDocument();
    fireEvent.click(await continueButton());
    expect(screen.getByText("Step 2")).toBeInTheDocument();
    expect(mocks.importKeywordsFromCsv).not.toHaveBeenCalled();
  });

  it("blocks 501 received rows with the actual limit and a split remedy", async () => {
    renderWizard();
    await reachUpload();

    fireEvent.click(screen.getByRole("button", { name: "Paste 501 rows" }));

    expect(
      await screen.findByText(
        "This file contains 501 rows; the maximum is 500. Duplicate rows count toward this limit. Remove duplicates, reduce the file, or split it into multiple imports.",
      ),
    ).toBeInTheDocument();
    fireEvent.click(await continueButton());
    expect(screen.getByText("Step 2")).toBeInTheDocument();
    expect(mocks.importKeywordsFromCsv).not.toHaveBeenCalled();
  });

  it("imports pasted CSV and refreshes only after closing the done step", async () => {
    renderWizard();
    await reachReviewWithCsv();

    fireEvent.click(screen.getByRole("button", { name: "Import 2 keywords" }));

    expect(await screen.findByText("2 added, 0 skipped, 0 failed")).toBeInTheDocument();
    expect(mocks.importKeywordsFromCsv).toHaveBeenCalledWith({
      csv: "rank tracker\nseo api",
      duplicateMode: "skip",
      projectId: "project_1",
      refresh: "deferred",
    });
    expect(mocks.refresh).not.toHaveBeenCalled();
    expect(mocks.refreshKeywordViewsAfterImport).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(mocks.onClose).toHaveBeenCalledOnce();
    await waitFor(() => expect(mocks.refreshKeywordViewsAfterImport).toHaveBeenCalledOnce());
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });

  it("submits only after the explicit Review confirmation", async () => {
    const user = userEvent.setup();
    renderWizard();
    await user.click(await continueButton());
    await user.click(screen.getByRole("button", { name: "Paste CSV" }));
    await user.click(await continueButton());
    expect(await screen.findByText("Map 2: rank tracker, seo api")).toBeInTheDocument();

    const mapContinue = await continueButton();
    await user.click(mapContinue);

    expect(await screen.findByText("Review 2: rank tracker, seo api")).toBeInTheDocument();
    expect(mocks.importKeywordsFromCsv).not.toHaveBeenCalled();

    const reviewConfirmation = screen.getByRole("button", { name: "Import 2 keywords" });
    expect(reviewConfirmation).not.toBe(mapContinue);
    expect(reviewConfirmation).toHaveAttribute("type", "button");
    await user.click(reviewConfirmation);

    await waitFor(() => expect(mocks.importKeywordsFromCsv).toHaveBeenCalledOnce());
  });

  it("keeps partial-import results visible across the server refresh boundary", async () => {
    mocks.importKeywordsFromCsv.mockImplementation(async () => {
      mocks.remountGrid();
      return {
        created: 1,
        errors: [
          { message: "Unsupported device", row: 3 },
          { message: "Unknown location", row: 4 },
        ],
        failed: 2,
        skipped: 0,
      };
    });
    render(<ServerRefreshBoundaryHarness />);
    fireEvent.click(screen.getByRole("button", { name: "Import" }));
    await reachReviewWithCsv();

    fireEvent.click(screen.getByRole("button", { name: "Import 2 keywords" }));

    expect(await screen.findByText("1 added, 0 skipped, 2 failed")).toBeInTheDocument();
    expect(screen.getByText("Row 3: Unsupported device")).toBeInTheDocument();
    expect(screen.getByText("Row 4: Unknown location")).toBeInTheDocument();
    expect(screen.getByText("Grid rows: 0")).toBeInTheDocument();
    expect(mocks.refresh).not.toHaveBeenCalled();
    expect(mocks.refreshKeywordViewsAfterImport).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Done" }));

    expect(await screen.findByText("Grid rows: 1")).toBeInTheDocument();
    expect(screen.queryByText("1 added, 0 skipped, 2 failed")).not.toBeInTheDocument();
    expect(mocks.refreshKeywordViewsAfterImport).toHaveBeenCalledOnce();
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });

  it("resets frozen children and wizard state when the project changes", async () => {
    const view = render(
      <KeywordImportProvider activeProjectId="project_1">
        <ImportLauncher rowCount={1} />
      </KeywordImportProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Import" }));
    expect(await screen.findByText("Template instructions")).toBeInTheDocument();

    view.rerender(
      <KeywordImportProvider activeProjectId="project_2">
        <ImportLauncher projectId="project_2" rowCount={2} />
      </KeywordImportProvider>,
    );

    expect(screen.queryByText("Template instructions")).not.toBeInTheDocument();
    expect(screen.getByText("Grid rows: 2")).toBeInTheDocument();
  });

  it("resets frozen children and wizard state when the path changes", async () => {
    const view = render(
      <KeywordImportProvider activeProjectId="project_1">
        <ImportLauncher rowCount={1} />
      </KeywordImportProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Import" }));
    expect(await screen.findByText("Template instructions")).toBeInTheDocument();

    mocks.pathname.mockReturnValue("/app/overview");
    view.rerender(
      <KeywordImportProvider activeProjectId="project_1">
        <p>Overview content</p>
      </KeywordImportProvider>,
    );

    expect(screen.queryByText("Template instructions")).not.toBeInTheDocument();
    expect(screen.getByText("Overview content")).toBeInTheDocument();
  });

  it("imports a workbook as FormData and supports Back navigation", async () => {
    renderWizard();
    await reachUpload();
    fireEvent.click(screen.getByRole("button", { name: "Choose workbook" }));
    await waitFor(() => expect(mocks.previewKeywordImportFile).toHaveBeenCalledOnce());
    fireEvent.click(await continueButton());
    expect(await screen.findByText("Map 2: rank tracker, mobile serp")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(await screen.findByText("Step 2")).toBeInTheDocument();
    fireEvent.click(await continueButton());
    fireEvent.click(await continueButton());

    fireEvent.click(screen.getByRole("button", { name: "Import workbook" }));
    await waitFor(() => expect(mocks.importKeywordsFromCsv).toHaveBeenCalledOnce());
    const input = mocks.importKeywordsFromCsv.mock.calls[0]?.[0];
    expect(input).toBeInstanceOf(FormData);
    expect(input.get("projectId")).toBe("project_1");
    expect(input.get("refresh")).toBe("deferred");
    expect((input.get("file") as File).name).toBe("keywords.xlsx");
  });

  it("ignores a stale workbook preview response after a newer selection succeeds", async () => {
    let resolveFirstPreview!: (value: {
      error: { code: "missing_required_column"; message: string; row: number };
      ok: false;
    }) => void;
    const firstPreview = new Promise<Parameters<typeof resolveFirstPreview>[0]>((resolve) => {
      resolveFirstPreview = resolve;
    });
    mocks.previewKeywordImportFile
      .mockImplementationOnce(() => firstPreview)
      .mockResolvedValueOnce({
        ok: true,
        rows: [
          { keyword: "new workbook one", row: 2 },
          { keyword: "new workbook two", row: 3 },
        ],
      });
    renderWizard();
    await reachUpload();

    fireEvent.click(screen.getByRole("button", { name: "Choose workbook" }));
    fireEvent.click(screen.getByRole("button", { name: "Choose workbook" }));
    await waitFor(() => expect(mocks.previewKeywordImportFile).toHaveBeenCalledTimes(2));
    resolveFirstPreview({
      error: { code: "missing_required_column", message: "Stale preview error", row: 1 },
      ok: false,
    });
    fireEvent.click(await continueButton());

    expect(
      await screen.findByText("Map 2: new workbook one, new workbook two"),
    ).toBeInTheDocument();
    expect(screen.queryByText("Stale preview error")).not.toBeInTheDocument();
  });

  it("blocks a workbook whose recognized headers omit keyword", async () => {
    mocks.previewKeywordImportFile.mockResolvedValue({
      error: {
        code: "missing_required_column",
        message: 'Missing required keyword column. Add a column named "keyword" and try again.',
        row: 1,
      },
      ok: false,
    });
    renderWizard();
    await reachUpload();

    fireEvent.click(screen.getByRole("button", { name: "Choose workbook" }));

    expect(
      await screen.findByText(
        'Missing required keyword column. Add a column named "keyword" and try again.',
      ),
    ).toBeInTheDocument();
    fireEvent.click(await continueButton());
    expect(screen.getByText("Step 2")).toBeInTheDocument();
    expect(mocks.importKeywordsFromCsv).not.toHaveBeenCalled();
  });

  it("renders safe action failures and clears state when the sheet closes", async () => {
    mocks.importKeywordsFromCsv.mockRejectedValue(new Error("Import service unavailable"));
    renderWizard();
    await reachReviewWithCsv();

    fireEvent.click(screen.getByRole("button", { name: "Import 2 keywords" }));
    expect(await screen.findByText("Import service unavailable")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Close sheet" }));
    expect(mocks.onClose).toHaveBeenCalledOnce();
  });
});
