import { stubBlobDownload } from "@/tests/blob-download";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DoneStep, MapStep, ReviewStep, TemplateStep, UploadStep } from "./ImportCsvWizardPanels";

describe("ImportCsvWizardPanels", () => {
  const parsedRows = [
    {
      city: "Austin",
      device: "desktop",
      keyword: "rank tracker",
      location: "US",
      locationKey: undefined,
      row: 2,
      tags: ["Core", "SEO"],
      targetUrl: "/rank",
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

  it("downloads the CSV template", async () => {
    const { objectUrls } = stubBlobDownload();
    render(<TemplateStep />);
    fireEvent.click(screen.getByRole("button", { name: "Download template.csv" }));
    expect(objectUrls).toHaveBeenCalledOnce();
    const blob = objectUrls.mock.calls[0]?.[0];
    if (!(blob instanceof Blob)) throw new Error("Expected template blob.");
    await waitFor(() => expect(URL.revokeObjectURL).toHaveBeenCalledWith(`blob:${blob.size}`));
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

  it("renders mapped and review labels for CSV and workbooks", () => {
    const { rerender } = render(<MapStep parsedCount={2} parsedRows={parsedRows} />);
    expect(screen.getByText("rank tracker")).toBeInTheDocument();
    expect(screen.getByText("/rank")).toBeInTheDocument();
    expect(screen.getByText("Core, SEO")).toBeInTheDocument();
    expect(screen.getByText("US / Austin")).toBeInTheDocument();
    expect(screen.getByText("desktop")).toBeInTheDocument();
    expect(screen.getByText("mobile serp")).toBeInTheDocument();
    expect(screen.getByText(/2 keywords found/)).toBeInTheDocument();
    rerender(<MapStep parsedCount={null} parsedRows={null} />);
    expect(screen.getByText(/Workbook selected/)).toBeInTheDocument();
    rerender(<ReviewStep parsedCount={2} parsedRows={parsedRows} />);
    expect(screen.getByText(/2 rows ready/)).toBeInTheDocument();
    expect(screen.getByText("/mobile")).toBeInTheDocument();
    rerender(<ReviewStep parsedCount={null} parsedRows={null} />);
    expect(screen.getByText(/Workbook ready/)).toBeInTheDocument();
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
