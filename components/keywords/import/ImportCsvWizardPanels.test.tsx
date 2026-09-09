import { ToastProvider } from "@/components/ui/Toast";
import { keywordImportTemplateCsv } from "@/lib/keywords/import-csv-template";
import { stubBlobDownload } from "@/tests/blob-download";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DoneStep, MapStep, ReviewStep, TemplateStep, UploadStep } from "./ImportCsvWizardPanels";
import { ParsedRowsPreview } from "./ParsedRowsPreview";

function renderTemplate() {
  return render(
    <ToastProvider>
      <TemplateStep />
    </ToastProvider>,
  );
}

function mockPreviewViewport() {
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(320);
  vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(320);
  vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(456);
}

describe("ImportCsvWizardPanels", () => {
  const parsedRows = [
    {
      city: "Austin",
      device: "desktop",
      intent: "commercial",
      keyword: "rank tracker",
      language: "en",
      location: "US",
      locationKey: "US/Texas/Austin",
      row: 2,
      tags: ["Core", "SEO"],
      targetUrl: "/rank",
      topic: "Product",
    },
    {
      device: "mobile",
      keyword: "mobile serp",
      location: "GB",
      row: 3,
      tags: ["Product"],
      targetUrl: "/mobile",
    },
  ];
  const review = { duplicateRows: 1, errors: [], received: 3, rows: parsedRows };
  const mapProps = {
    hasHeader: true,
    isReviewing: false,
    mapping: {
      city: 7,
      device: 9,
      intent: 4,
      keyword: 0,
      language: 6,
      location: 5,
      locationKey: 8,
      tags: 2,
      targetUrl: 1,
      topic: 3,
    },
    onMappingChange: vi.fn(),
    sourceColumns: [
      "keyword",
      "target_url",
      "tags",
      "topic",
      "intent",
      "country",
      "language",
      "city",
      "location_key",
      "device",
    ].map((label, index) => ({ index, label })),
  };

  afterEach(() => vi.restoreAllMocks());

  it("downloads the CSV template", async () => {
    const { objectUrls } = stubBlobDownload();
    renderTemplate();
    const download = screen.getByRole("button", { name: "Download template.csv" });
    expect(download).toHaveAttribute("data-variant", "secondary");
    expect(download).toHaveAttribute("data-size", "md");
    expect(download).not.toHaveAttribute("data-variant", "primary");
    expect(download).not.toHaveAttribute("data-size", "lg");
    fireEvent.click(download);
    expect(objectUrls).toHaveBeenCalledOnce();
    const blob = objectUrls.mock.calls[0]?.[0];
    if (!(blob instanceof Blob)) throw new Error("Expected template blob.");
    await waitFor(() => expect(URL.revokeObjectURL).toHaveBeenCalledWith(`blob:${blob.size}`));
  });

  it("copies the CSV template", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    renderTemplate();
    fireEvent.click(screen.getByRole("button", { name: "Copy template" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(keywordImportTemplateCsv));
    expect(screen.getByText("csv").closest("div")?.parentElement).toHaveClass("border-code-border");
  });

  it("updates pasted CSV and renders errors and singular counts", () => {
    const onCsvTextChange = vi.fn();
    render(
      <UploadStep
        csvText="keyword"
        errorMessage="Invalid CSV"
        importFile={null}
        onCsvFileError={vi.fn()}
        onCsvTextChange={onCsvTextChange}
        onUnsupportedFile={vi.fn()}
        onWorkbookFileChange={vi.fn()}
        parsedCount={1}
      />,
    );
    expect(screen.getAllByText("1 keyword parsed")).toHaveLength(2);
    expect(screen.getByText("Invalid CSV")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Paste CSV"), { target: { value: "seo api" } });
    expect(onCsvTextChange).toHaveBeenCalledWith("seo api");
  });

  it("explains the file source, destination, required column, and location precedence", () => {
    render(<MapStep {...mapProps} parsedCount={2} />);

    expect(screen.getByText("In your file")).toBeInTheDocument();
    expect(screen.getByText("Save as")).toBeInTheDocument();
    expect(
      screen.getByText(
        /Keyword is required\. Missing location fields use the market selected above/,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Location key takes priority over Country and City\./),
    ).toBeInTheDocument();
  });

  it("renders mapped and review labels for CSV and workbooks", async () => {
    const { rerender } = render(<MapStep {...mapProps} parsedCount={2} />);
    expect(screen.getByRole("button", { name: "Map keyword" })).toHaveTextContent("Keyword");
    expect(screen.getByRole("button", { name: "Map target_url" })).toHaveTextContent("Target URL");
    fireEvent.click(screen.getByRole("button", { name: "Map keyword" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Tags" }));
    expect(mapProps.onMappingChange).toHaveBeenCalledWith(0, "tags");
    expect(screen.getByText(/2 keywords found/)).toBeInTheDocument();
    rerender(<MapStep {...mapProps} parsedCount={null} />);
    expect(screen.getByText(/Workbook selected/)).toBeInTheDocument();
    rerender(<MapStep {...mapProps} isReviewing parsedCount={2} />);
    expect(screen.getByRole("status")).toHaveTextContent(
      "Checking mapped rows and project markets",
    );
    rerender(<ReviewStep parsedCount={2} review={review} />);
    expect(screen.getByText(/2 valid rows ready after removing 1 duplicate/)).toBeInTheDocument();
    expect(screen.getByText("/mobile")).toBeInTheDocument();
    expect(screen.getByRole("table", { name: "Imported rows preview" })).toHaveAttribute(
      "data-layout",
      "auto",
    );
    expect(screen.queryByText("Duplicate handling")).not.toBeInTheDocument();
    expect(screen.queryByText("Skip existing keywords")).not.toBeInTheDocument();
    rerender(<ReviewStep parsedCount={null} review={null} />);
    expect(screen.getByText(/Checking rows before import/)).toBeInTheDocument();
  });

  it("renders the bounded preview with DataTable semantics", () => {
    mockPreviewViewport();
    const rows = Array.from({ length: 11 }, (_, index) => ({
      keyword: `keyword ${index + 1}`,
      row: index + 1,
    }));
    render(<ParsedRowsPreview rows={rows} />);

    expect(screen.getByText("keyword 10")).toBeInTheDocument();
    expect(screen.getByText("keyword 11")).toBeInTheDocument();
    expect(screen.getByRole("table", { name: "Imported rows preview" })).toHaveAttribute(
      "data-layout",
      "fill",
    );
  });

  it("virtualizes a large preview and reaches its final row after scrolling", () => {
    mockPreviewViewport();
    const rows = Array.from({ length: 1_000 }, (_, index) => ({
      keyword: `keyword ${index + 1}`,
      row: index + 1,
    }));
    render(<ParsedRowsPreview rows={rows} />);

    const table = screen.getByRole("table", { name: "Imported rows preview" });
    const body = screen.getByTestId("imported-rows-preview-body");
    expect(table).toHaveAttribute("data-layout", "fill");
    expect(table.parentElement).toHaveStyle({ height: "456px" });
    expect(body.childElementCount).toBeLessThan(30);
    expect(screen.queryByText("keyword 1000")).not.toBeInTheDocument();

    table.scrollTop = 55_586;
    fireEvent.scroll(table);

    expect(screen.getByText("keyword 1000")).toBeInTheDocument();
  });

  it("renders completion warnings and limits displayed errors", () => {
    render(
      <DoneStep
        result={{
          created: 3,
          errors: Array.from({ length: 8 }, (_, index) => ({
            message: `Error ${index}`,
            row: index + 1,
          })),
          failed: 8,
          skipped: 2,
          warning: "Some locations need review",
        }}
      />,
    );
    expect(screen.getByText("3 added, 2 skipped, 8 failed.")).toBeInTheDocument();
    expect(screen.getByText("Some locations need review")).toBeInTheDocument();
    expect(screen.getByText("Row 6: Error 5")).toBeInTheDocument();
    expect(screen.queryByText("Row 7: Error 6")).not.toBeInTheDocument();
  });
});

it("shows exact row failures and paused-market consequences during review", () => {
  render(
    <ReviewStep
      parsedCount={2}
      review={{
        duplicateRows: 0,
        received: 2,
        rows: [
          { keyword: "first keyword", row: 2, marketName: "US launch", marketStatus: "paused" },
        ],
        errors: [
          { row: 3, message: "Market GB is not tracked by this project. Add it in Markets first." },
        ],
      }}
    />,
  );
  expect(screen.getByText("US launch (paused)")).toBeVisible();
  expect(screen.getByRole("status")).toHaveTextContent("until those markets are resumed");
  expect(screen.getByRole("list", { name: "Import validation errors" })).toHaveTextContent(
    "Row 3: Market GB is not tracked",
  );
});
