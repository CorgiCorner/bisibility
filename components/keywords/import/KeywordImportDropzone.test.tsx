import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { KeywordImportDropzone } from "./KeywordImportDropzone";

function renderDropzone(overrides: Record<string, unknown> = {}) {
  const handlers = {
    onCsvTextChange: vi.fn(),
    onCsvFileError: vi.fn(),
    onUnsupportedFile: vi.fn(),
    onWorkbookFileChange: vi.fn(),
  };
  const view = render(
    <KeywordImportDropzone parsedCount={0} selectedFileName={null} {...handlers} {...overrides} />,
  );
  return { ...handlers, ...view };
}

describe("KeywordImportDropzone", () => {
  it("reads CSV files selected from the input and clears its value", async () => {
    const test = renderDropzone();
    const file = new File(["keyword\nrank tracker"], "keywords.CSV", { type: "text/plain" });
    const bytes = new TextEncoder().encode("keyword\nrank tracker").buffer;
    Object.defineProperty(file, "arrayBuffer", { value: vi.fn(async () => bytes) });
    const input = test.container.querySelector('input[type="file"]') as HTMLInputElement;

    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() =>
      expect(test.onCsvTextChange).toHaveBeenCalledWith("keyword\nrank tracker", file),
    );
    expect(input.value).toBe("");
  });

  it("rejects non-UTF8 CSV bytes without emitting replacement characters", async () => {
    const test = renderDropzone();
    const bytes = new Uint8Array([0x6b, 0x65, 0x79, 0x77, 0x6f, 0x72, 0x64, 0x0a, 0xff]).buffer;
    const file = new File([bytes], "windows-1250.csv", { type: "text/csv" });
    Object.defineProperty(file, "arrayBuffer", { value: vi.fn(async () => bytes) });
    const input = test.container.querySelector('input[type="file"]') as HTMLInputElement;

    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() =>
      expect(test.onCsvFileError).toHaveBeenCalledWith(
        "CSV import files must be UTF-8 encoded. Re-export the file as UTF-8 and try again.",
      ),
    );
    expect(test.onCsvTextChange).not.toHaveBeenCalled();
  });

  it("accepts workbook drops and prevents the browser drag behavior", async () => {
    const test = renderDropzone({ selectedFileName: "keywords.xlsx" });
    const workbook = new File(["xlsx"], "keywords.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const label = test.container.querySelector("label");
    expect(label).not.toBeNull();
    const drag = new Event("dragover", { bubbles: true, cancelable: true });
    label?.dispatchEvent(drag);
    expect(drag.defaultPrevented).toBe(true);

    fireEvent.drop(label as HTMLLabelElement, { dataTransfer: { files: [workbook] } });
    await waitFor(() => expect(test.onWorkbookFileChange).toHaveBeenCalledWith(workbook));
    expect(screen.getByText("keywords.xlsx")).toBeInTheDocument();
  });

  it("rejects legacy XLS files with save-as-XLSX guidance", async () => {
    const test = renderDropzone();
    const input = test.container.querySelector('input[type="file"]') as HTMLInputElement;
    const legacyWorkbook = new File(["xls"], "keywords.xls", {
      type: "application/vnd.ms-excel",
    });

    expect(input.accept).not.toContain(".xls,");
    fireEvent.change(input, { target: { files: [legacyWorkbook] } });

    await waitFor(() =>
      expect(test.onCsvFileError).toHaveBeenCalledWith(
        "Legacy .xls files are not supported. Save the workbook as .xlsx and try again.",
      ),
    );
    expect(test.onWorkbookFileChange).not.toHaveBeenCalled();
  });

  it("rejects unsupported files and ignores empty drops", async () => {
    const test = renderDropzone({ parsedCount: 1 });
    const label = test.container.querySelector("label");
    expect(label).not.toBeNull();
    const unsupported = new File(["data"], "keywords.json", { type: "application/json" });

    fireEvent.drop(label as HTMLLabelElement, { dataTransfer: { files: [unsupported] } });
    await waitFor(() => expect(test.onUnsupportedFile).toHaveBeenCalledOnce());
    fireEvent.drop(label as HTMLLabelElement, { dataTransfer: { files: [] } });
    expect(screen.getByText("1 keyword parsed")).toBeInTheDocument();
  });
});
