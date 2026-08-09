"use client";

import { actionWarningMessage } from "@/components/keywords/action-utils";
import { LocationActionWarning } from "@/components/keywords/LocationActionWarning";
import { Button } from "@/components/ui";
import type { KeywordImportCsvRow } from "@/lib/keywords/import-csv-parser";
import { downloadTextFile } from "@/lib/ui/download";
import {
  CheckCircleIcon as CheckCircle,
  DownloadSimpleIcon as DownloadSimple,
  TableIcon as Table,
} from "@phosphor-icons/react";
import { KeywordImportDropzone } from "./KeywordImportDropzone";

const templateCsv = `keyword,target_url,tags,country,device
edge function logs,/docs/logs,docs;infra,US,desktop
vector database,/products/vector,product,US,mobile
llms.txt,/blog/llms-txt,content,GB,desktop`;

type ParsedCount = number | null;
type ImportResultSummary = {
  created: number;
  errors: { message: string; row: number }[];
  failed: number;
  skipped: number;
  warning?: string | null;
};

type UploadStepProps = {
  csvText: string;
  errorMessage?: string;
  importFile: File | null;
  onCsvTextChange: (value: string) => void;
  onCsvFileError: (message: string) => void;
  onUnsupportedFile: () => void;
  onWorkbookFileChange: (file: File) => void;
  parsedCount: number;
};

const csvExample = `keyword,target_url,tags,country,device
open source analytics,/vs/ga,"Comparison",US,desktop
self hosted seo tool,/self-host,"Product",US,desktop`;

function downloadTemplate() {
  downloadTextFile(templateCsv, "bisibility-keywords-template.csv", "text/csv;charset=utf-8");
}

export function TemplateStep() {
  return (
    <div>
      <h3 className="m-0 text-[15px] font-semibold">Start from the template</h3>
      <p className="m-0 mt-1.5 text-[13px] leading-[1.55] text-fg-muted">
        Fill in your keywords, then upload the CSV on the next step. Only{" "}
        <code className="font-mono text-[12px] text-accent-text">keyword</code> is required.
      </p>
      <Button
        onClick={downloadTemplate}
        size="lg"
        startIcon={<DownloadSimple size={16} weight="bold" />}
        sx={{ marginTop: "16px" }}
        type="button"
        variant="primary"
      >
        Download template.csv
      </Button>
      <pre className="m-0 mt-[18px] overflow-x-auto rounded-[11px] bg-code-bg px-[15px] py-[13px] font-mono text-[11.5px] leading-[1.75] text-code-fg">
        {templateCsv}
      </pre>
    </div>
  );
}

export function UploadStep({
  csvText,
  errorMessage,
  importFile,
  onCsvTextChange,
  onCsvFileError,
  onUnsupportedFile,
  onWorkbookFileChange,
  parsedCount,
}: Readonly<UploadStepProps>) {
  return (
    <div className="grid gap-3.5">
      <KeywordImportDropzone
        onCsvFileError={onCsvFileError}
        onCsvTextChange={(value) => onCsvTextChange(value)}
        onUnsupportedFile={onUnsupportedFile}
        onWorkbookFileChange={onWorkbookFileChange}
        parsedCount={parsedCount}
        selectedFileName={importFile?.name}
      />
      <div>
        <div className="flex items-center justify-between gap-2">
          <label className="text-[12.5px] font-semibold text-fg" htmlFor="import-csv-input">
            Paste CSV
          </label>
          <span className="font-mono text-[11px] text-fg-muted">
            {parsedCount} {parsedCount === 1 ? "keyword" : "keywords"} parsed
          </span>
        </div>
        <textarea
          className="mt-2 min-h-[122px] w-full resize-y rounded-[10px] border border-border-strong bg-transparent px-[13px] py-3 font-mono text-[12px] leading-[1.7] text-fg outline-none focus:border-accent"
          id="import-csv-input"
          onChange={(event) => onCsvTextChange(event.target.value)}
          placeholder={csvExample}
          value={csvText}
        />
        {errorMessage ? (
          <p className="mt-2 font-mono text-[11.5px] text-red-text">{errorMessage}</p>
        ) : null}
      </div>
    </div>
  );
}

export function MapStep({
  parsedCount,
  parsedRows,
}: Readonly<{ parsedCount: ParsedCount; parsedRows: KeywordImportCsvRow[] | null }>) {
  const rows = [
    ["keyword", "Keyword", "required"],
    ["target_url", "Target URL", "optional"],
    ["tags", "Tags", "optional"],
    ["country", "Country", "optional"],
    ["city", "City", "optional"],
    ["location_key", "Location key", "optional"],
    ["device", "Device", "optional"],
  ] as const;
  const keywordNoun = parsedCount === 1 ? "keyword" : "keywords";
  const label =
    parsedCount === null
      ? "Workbook selected. Known columns are matched automatically on import."
      : `${parsedCount} ${keywordNoun} found. Known columns are matched automatically.`;
  return (
    <div>
      <h3 className="m-0 text-[15px] font-semibold">Map columns</h3>
      <p className="m-0 mt-1.5 text-[13px] text-fg-muted">{label}</p>
      <div className="mt-4 overflow-hidden rounded-xl border border-border">
        {rows.map(([csv, field, state]) => (
          <div
            className="grid grid-cols-[1fr_1fr_78px] items-center gap-2 border-t border-border-soft px-[15px] py-[11px] first:border-t-0"
            key={csv}
          >
            <span className="inline-flex min-w-0 items-center gap-[7px] font-mono text-[12.5px]">
              <Table className="shrink-0 text-fg-muted" size={14} />
              <span className="truncate">{csv}</span>
            </span>
            <span className="truncate text-[12.5px] font-semibold text-fg">{field}</span>
            <span className="font-mono text-[10px] uppercase tracking-[0.4px] text-fg-muted">
              {state}
            </span>
          </div>
        ))}
      </div>
      <ParsedRowsPreview rows={parsedRows} />
    </div>
  );
}

function previewLocation(row: KeywordImportCsvRow) {
  return [row.locationKey ?? row.location, row.city].filter(Boolean).join(" / ") || "-";
}

function ParsedRowsPreview({ rows }: Readonly<{ rows: KeywordImportCsvRow[] | null }>) {
  if (!rows?.length) return null;
  return (
    <div className="mt-4 overflow-x-auto rounded-xl border border-border">
      <table className="w-full min-w-[640px] border-collapse text-left text-[12px]">
        <thead className="bg-bg-sunken font-mono text-[10px] uppercase tracking-[0.4px] text-fg-muted">
          <tr>
            {["Keyword", "Target URL", "Tags", "Location", "Device"].map((label) => (
              <th className="px-3 py-2 font-medium" key={label}>
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr className="border-t border-border-soft" key={row.row}>
              <td className="px-3 py-2.5 font-semibold text-fg">{row.keyword || "-"}</td>
              <td className="px-3 py-2.5 text-fg-muted">{row.targetUrl ?? "-"}</td>
              <td className="px-3 py-2.5 text-fg-muted">{row.tags?.join(", ") || "-"}</td>
              <td className="px-3 py-2.5 text-fg-muted">{previewLocation(row)}</td>
              <td className="px-3 py-2.5 text-fg-muted">{row.device ?? "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ReviewStep({
  parsedCount,
  parsedRows,
}: Readonly<{ parsedCount: ParsedCount; parsedRows: KeywordImportCsvRow[] | null }>) {
  const rowNoun = parsedCount === 1 ? "row" : "rows";
  const label =
    parsedCount === null
      ? "Workbook ready for server validation."
      : `${parsedCount} ${rowNoun} ready for server validation.`;
  return (
    <div>
      <h3 className="m-0 text-[15px] font-semibold">Review and confirm</h3>
      <div className="mt-3.5 rounded-[11px] border border-border bg-bg px-3.5 py-3">
        <div className="font-mono text-[11px] uppercase tracking-[0.5px] text-fg-muted">
          Duplicate handling
        </div>
        <div className="mt-2 inline-flex rounded-[9px] bg-accent-solid px-[13px] py-1.5 text-[12px] font-semibold text-primary-contrast">
          Skip existing keywords
        </div>
      </div>
      <p className="m-0 mt-3.5 text-[13px] leading-[1.55] text-fg-muted">
        Import will validate every row, skip duplicates in the file and project, and create the
        remaining keywords with their target URLs, tags, country, and device.
      </p>
      <ParsedRowsPreview rows={parsedRows} />
      <div className="mt-4 rounded-xl border border-border bg-bg-sunken px-4 py-3 font-mono text-[12px] text-fg-muted">
        {label}
      </div>
    </div>
  );
}

export function DoneStep({ result }: Readonly<{ result: ImportResultSummary }>) {
  const warning = actionWarningMessage(result);
  return (
    <div className="flex flex-col items-center px-4 py-[30px] text-center">
      <span className="grid h-14 w-14 place-items-center rounded-[15px] text-green-text [background:color-mix(in_srgb,var(--green)_12%,transparent)]">
        <CheckCircle size={30} weight="fill" />
      </span>
      <h3 className="m-0 mt-[18px] text-[18px] font-semibold tracking-[-0.4px]">Import complete</h3>
      <p className="m-0 mt-[7px] max-w-[340px] text-[13.5px] leading-[1.55] text-fg-muted">
        {result.created} added, {result.skipped} skipped, {result.failed} failed.
      </p>
      <LocationActionWarning message={warning} />
      {result.errors.length ? (
        <div className="mt-4 max-h-32 w-full overflow-auto rounded-[10px] bg-bg-sunken p-3 text-left font-mono text-[11px] text-red-text">
          {result.errors.slice(0, 6).map((error) => (
            <div key={`${error.row}-${error.message}`}>
              Row {error.row}: {error.message}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
