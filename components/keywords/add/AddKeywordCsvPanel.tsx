"use client";

import { Textarea } from "@/components/ui";
import { keywordImportTemplateCsv } from "@/lib/keywords/import-csv-template";
import { UploadSimpleIcon as UploadSimple } from "@phosphor-icons/react";

type AddKeywordCsvPanelProps = {
  csvText: string;
  errorMessage?: string;
  onCsvTextChange: (value: string) => void;
  parsedCount: number;
};

const csvColumnsHint = "keyword, target_url, tags, country, language, device";

function handleDragOver(event: React.DragEvent<HTMLLabelElement>) {
  event.preventDefault();
}

export function AddKeywordCsvPanel({
  csvText,
  errorMessage,
  onCsvTextChange,
  parsedCount,
}: Readonly<AddKeywordCsvPanelProps>) {
  async function readCsvFile(file: File) {
    onCsvTextChange(await file.text());
  }

  async function handleDrop(event: React.DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    const file = event.dataTransfer.files[0];
    if (file) {
      await readCsvFile(file);
    }
  }

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    if (!file) {
      return;
    }

    await readCsvFile(file);
    event.currentTarget.value = "";
  }

  return (
    <div className="flex flex-col gap-3.5">
      <label
        className="flex cursor-pointer flex-col items-center gap-2 rounded-card border border-dashed border-border-control bg-transparent px-4 py-8 text-center hover:border-accent focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent-solid"
        onDragOver={handleDragOver}
        onDrop={(event) => void handleDrop(event)}
      >
        <UploadSimple className="text-accent-solid" size={26} />
        <span className="text-[13.5px] font-semibold text-fg">Drop a CSV or click to upload</span>
        <span className="text-[11.5px] text-fg-muted">{csvColumnsHint}</span>
        <input
          accept=".csv,text/csv"
          className="sr-only"
          onChange={(event) => void handleFileChange(event)}
          type="file"
        />
      </label>

      <div>
        <div className="flex items-center justify-between gap-2">
          <label className="text-[12.5px] font-semibold text-fg" htmlFor="add-csv-input">
            Paste CSV
          </label>
          <span className="font-mono text-[11px] text-fg-muted">
            {parsedCount} {parsedCount === 1 ? "keyword" : "keywords"} parsed
          </span>
        </div>
        <Textarea
          className="mt-2 min-h-[122px] text-[12px]"
          id="add-csv-input"
          onChange={(event) => onCsvTextChange(event.target.value)}
          placeholder={keywordImportTemplateCsv}
          value={csvText}
        />
        {errorMessage ? (
          <p className="mt-2 font-mono text-[11.5px] text-red-text">{errorMessage}</p>
        ) : null}
      </div>

      <pre className="m-0 overflow-x-auto rounded-control bg-code-bg p-3.5 font-mono text-[11.5px] leading-[1.7] text-code-fg">
        {keywordImportTemplateCsv}
      </pre>
    </div>
  );
}
