"use client";

import {
  decodeKeywordImportCsv,
  LEGACY_XLS_IMPORT_MESSAGE,
} from "@/lib/keywords/import-csv-parser";
import {
  FileCsvIcon as FileCsv,
  FileXlsIcon as FileXls,
  UploadSimpleIcon as UploadSimple,
} from "@phosphor-icons/react";

const importAccept = [
  ".csv",
  ".xlsx",
  "text/csv",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
].join(",");

const workbookTypes = new Set([
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);

type KeywordImportDropzoneProps = {
  onCsvTextChange: (value: string, file: File) => void;
  onCsvFileError: (message: string) => void;
  onUnsupportedFile: () => void;
  onWorkbookFileChange: (file: File) => void;
  parsedCount: number;
  selectedFileName?: string | null;
};

function fileKind(file: File) {
  if (/\.csv$/i.test(file.name) || file.type === "text/csv") return "csv";
  if (/\.xls$/i.test(file.name)) return "legacy-workbook";
  if (/\.xlsx$/i.test(file.name) || workbookTypes.has(file.type)) return "workbook";
  return null;
}

function handleDragOver(event: React.DragEvent<HTMLLabelElement>) {
  event.preventDefault();
}

export function KeywordImportDropzone({
  onCsvTextChange,
  onCsvFileError,
  onUnsupportedFile,
  onWorkbookFileChange,
  parsedCount,
  selectedFileName,
}: Readonly<KeywordImportDropzoneProps>) {
  async function handleFile(file: File) {
    const kind = fileKind(file);
    if (kind === "csv") {
      try {
        onCsvTextChange(decodeKeywordImportCsv(await file.arrayBuffer()), file);
      } catch (error) {
        onCsvFileError(error instanceof Error ? error.message : "Could not read the CSV file.");
      }
      return;
    }
    if (kind === "workbook") {
      onWorkbookFileChange(file);
      return;
    }
    if (kind === "legacy-workbook") {
      onCsvFileError(LEGACY_XLS_IMPORT_MESSAGE);
      return;
    }
    onUnsupportedFile();
  }

  async function handleDrop(event: React.DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    const file = event.dataTransfer.files[0];
    if (file) await handleFile(file);
  }

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (file) await handleFile(file);
    input.value = "";
  }

  const Icon = selectedFileName?.match(/\.xlsx$/i) ? FileXls : FileCsv;
  const keywordNoun = parsedCount === 1 ? "keyword" : "keywords";
  let status = "CSV or XLSX";
  if (selectedFileName) status = selectedFileName;
  else if (parsedCount > 0) status = `${parsedCount} ${keywordNoun} parsed`;

  return (
    <label
      className="flex cursor-pointer flex-col items-center gap-2 rounded-[12px] border border-dashed border-border-strong bg-bg-sunken px-4 py-8 text-center outline-none hover:border-accent"
      onDragOver={handleDragOver}
      onDrop={(event) => void handleDrop(event)}
    >
      <span className="grid h-10 w-10 place-items-center rounded-[11px] bg-accent-soft text-accent">
        {selectedFileName ? <Icon size={22} weight="bold" /> : <UploadSimple size={23} />}
      </span>
      <span className="text-[13.5px] font-semibold text-fg">Drop CSV or XLSX here</span>
      <span className="text-[11.5px] text-fg-faint">{status}</span>
      <span className="max-w-[360px] text-[11.5px] leading-[1.5] text-fg-faint">
        Files are parsed in memory for import and never stored.
      </span>
      <input
        accept={importAccept}
        className="sr-only"
        onChange={(event) => void handleFileChange(event)}
        type="file"
      />
    </label>
  );
}
