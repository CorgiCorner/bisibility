"use client";

import { Textarea } from "@/components/ui";
import { UploadSimpleIcon as UploadSimple } from "@phosphor-icons/react";

type AddKeywordCsvPanelProps = {
  csvText: string;
  errorMessage?: string;
  onCsvTextChange: (value: string) => void;
  parsedCount: number;
};

const csvExample = `keyword,target_url,tags,country,device
open source analytics,/vs/ga,"Comparison",US,desktop
self hosted seo tool,/self-host,"Product",US,desktop`;

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
        className="flex cursor-pointer flex-col items-center gap-2 rounded-[12px] border border-dashed border-border-strong bg-transparent px-4 py-8 text-center hover:border-accent focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent-solid"
        onDragOver={handleDragOver}
        onDrop={(event) => void handleDrop(event)}
      >
        <UploadSimple className="text-accent-text" size={26} />
        <span className="text-[13.5px] font-semibold text-fg">Drop a CSV or click to upload</span>
        <span className="text-[11.5px] text-fg-muted">
          keyword, target_url, tags, country, device
        </span>
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
          placeholder={csvExample}
          value={csvText}
        />
        {errorMessage ? (
          <p className="mt-2 font-mono text-[11.5px] text-red-text">{errorMessage}</p>
        ) : null}
      </div>

      <pre className="m-0 overflow-x-auto rounded-[10px] bg-code-bg p-3.5 font-mono text-[11.5px] leading-[1.7] text-code-fg">
        {csvExample}
      </pre>
    </div>
  );
}
