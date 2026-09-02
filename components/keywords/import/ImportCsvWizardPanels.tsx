"use client";

import { actionWarningMessage } from "@/components/keywords/action-utils";
import { LocationActionWarning } from "@/components/keywords/LocationActionWarning";
import { Button, CopyButton } from "@/components/ui";
import type {
  KeywordImportColumnMapping,
  KeywordImportField,
  KeywordImportSourceColumn,
} from "@/lib/keywords/import-csv-parser";
import { keywordImportTemplateCsv } from "@/lib/keywords/import-csv-template";
import { downloadTextFile } from "@/lib/ui/download";
import {
  CheckCircleIcon as CheckCircle,
  CircleNotchIcon as CircleNotch,
  DownloadSimpleIcon as DownloadSimple,
} from "@phosphor-icons/react";
import { ImportColumnMapping } from "./ImportColumnMapping";
import { KeywordImportDropzone } from "./KeywordImportDropzone";
import { type KeywordImportPreviewRow, ParsedRowsPreview } from "./ParsedRowsPreview";

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

const csvExample = `keyword,target_url,tags,country,language,device
open source analytics,/vs/ga,"Comparison",US,en,desktop
self hosted seo tool,/self-host,"Product",ES,es,desktop`;

const codeDarkCopy = {
  color: "var(--code-faint)",
  "&:hover": {
    backgroundColor: "color-mix(in srgb, var(--code-fg) 8%, transparent)",
    color: "var(--code-fg)",
  },
} as const;

function downloadTemplate() {
  downloadTextFile(
    keywordImportTemplateCsv,
    "bisibility-keywords-template.csv",
    "text/csv;charset=utf-8",
  );
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
        startIcon={<DownloadSimple size={15} weight="regular" />}
        sx={{ marginTop: "16px" }}
        type="button"
        variant="secondary"
      >
        Download template.csv
      </Button>
      <div className="mt-4.5 min-w-0 overflow-hidden rounded-control border border-code-border bg-code-bg">
        <div className="flex items-center justify-between gap-2 border-b border-code-border px-3 pt-2">
          <div
            className="rounded-t-lg px-3 py-1.5 font-sans tabular-nums text-[11.5px]"
            style={{
              backgroundColor: "color-mix(in srgb, var(--code-bg) 92%, var(--code-fg))",
              color: "var(--code-fg)",
            }}
          >
            csv
          </div>
          <CopyButton
            label="Copy template"
            size="sm"
            sx={codeDarkCopy}
            text={keywordImportTemplateCsv}
          />
        </div>
        <pre className="m-0 overflow-x-auto px-[15px] py-[13px] font-mono text-[11.5px] leading-[1.75] text-code-fg">
          {keywordImportTemplateCsv}
        </pre>
      </div>
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
          <span className="font-sans tabular-nums text-[11px] text-fg-muted">
            {parsedCount} {parsedCount === 1 ? "keyword" : "keywords"} parsed
          </span>
        </div>
        <textarea
          className="mt-2 min-h-[122px] w-full resize-y rounded-control border border-border-control bg-transparent px-[13px] py-3 font-sans tabular-nums text-[12px] leading-[1.7] text-fg outline-none focus:border-accent"
          id="import-csv-input"
          onChange={(event) => onCsvTextChange(event.target.value)}
          placeholder={csvExample}
          value={csvText}
        />
        {errorMessage ? (
          <p className="mt-2 font-sans tabular-nums text-[11.5px] text-red-text">{errorMessage}</p>
        ) : null}
      </div>
    </div>
  );
}

export function MapStep({
  hasHeader,
  isReviewing,
  mapping,
  onMappingChange,
  parsedCount,
  sourceColumns,
}: Readonly<{
  hasHeader: boolean;
  isReviewing: boolean;
  mapping: KeywordImportColumnMapping;
  onMappingChange: (sourceIndex: number, destination: KeywordImportField | null) => void;
  parsedCount: ParsedCount;
  sourceColumns: readonly KeywordImportSourceColumn[];
}>) {
  const keywordNoun = parsedCount === 1 ? "keyword" : "keywords";
  const label =
    parsedCount === null
      ? "Workbook selected. Check where each column should be saved."
      : `${parsedCount} ${keywordNoun} found. Check where each column should be saved.`;
  return (
    <div>
      <h3 className="m-0 text-[15px] font-semibold">Map columns</h3>
      <p className="m-0 mt-1.5 text-[13px] text-fg-muted">{label}</p>
      <p className="m-0 mt-2 text-[12px] leading-[1.5] text-fg-muted">
        Only Keyword is required. Optional tracking fields use your project defaults when omitted;
        other optional fields stay empty.
      </p>
      {hasHeader ? (
        <ImportColumnMapping
          mapping={mapping}
          onChange={onMappingChange}
          sourceColumns={sourceColumns}
        />
      ) : (
        <p className="mt-4 rounded-card border border-border bg-bg-sunken px-4 py-3 text-[12px] leading-[1.5] text-fg-muted">
          This file has no header row, so its standard column order is used. Add a header row to map
          columns yourself.
        </p>
      )}
      <p className="m-0 mt-3 text-[12px] leading-[1.5] text-fg-muted">
        <span className="font-medium text-fg">Location fields:</span> Country tracks a country; add
        City for local tracking, or use Location key for an exact saved location. Location key takes
        priority over Country and City. Language sets the search-result language.
      </p>
      {isReviewing ? (
        <p
          aria-live="polite"
          className="mt-4 flex items-center gap-2 text-[12px] text-fg-muted"
          role="status"
        >
          <CircleNotch weight="regular" aria-hidden className="animate-spin" size={15} />
          Checking mapped rows and project markets...
        </p>
      ) : null}
    </div>
  );
}

export function ReviewStep({
  parsedCount,
  review,
}: Readonly<{
  parsedCount: ParsedCount;
  review: {
    duplicateRows: number;
    errors: { message: string; row: number }[];
    received: number;
    rows: KeywordImportPreviewRow[];
  } | null;
}>) {
  const rowNoun = (review?.rows.length ?? parsedCount) === 1 ? "row" : "rows";
  const label =
    review === null
      ? "Checking rows before import."
      : `${review.rows.length} valid ${rowNoun} ready after removing ${review.duplicateRows} duplicate${review.duplicateRows === 1 ? "" : "s"} from this file.`;
  return (
    <div>
      <h3 className="m-0 text-[15px] font-semibold">Review and confirm</h3>
      <p className="m-0 mt-1.5 text-[13px] leading-[1.55] text-fg-muted">
        This list has passed column and market validation and removes duplicates within this file.
        Existing project duplicates are checked again when you confirm.
      </p>
      <ParsedRowsPreview rows={review?.rows ?? []} />
      {review?.errors.length ? (
        <div className="mt-4 rounded-card border border-border bg-bg-sunken px-4 py-3 text-[12px] leading-[1.5] text-red-text">
          {review.errors.length} {review.errors.length === 1 ? "row was" : "rows were"} excluded
          during validation. Fix the file or its project markets, then go back to include them.
        </div>
      ) : null}
      <div className="mt-4 rounded-card border border-border bg-bg-sunken px-4 py-3 font-sans tabular-nums text-[12px] text-fg-muted">
        {label}
      </div>
    </div>
  );
}

export function DoneStep({ result }: Readonly<{ result: ImportResultSummary }>) {
  const warning = actionWarningMessage(result);
  return (
    <div className="flex flex-col items-center px-4 py-[30px] text-center">
      <span className="grid h-14 w-14 place-items-center rounded-card text-green-text [background:color-mix(in_srgb,var(--green)_12%,transparent)]">
        <CheckCircle size={30} weight="regular" />
      </span>
      <h3 className="m-0 mt-4.5 text-[18px] font-semibold tracking-[-0.4px]">Import complete</h3>
      <p className="m-0 mt-[7px] max-w-[340px] text-[13.5px] leading-[1.55] text-fg-muted">
        {result.created} added, {result.skipped} skipped, {result.failed} failed.
      </p>
      <LocationActionWarning message={warning} />
      {result.errors.length ? (
        <div className="mt-4 max-h-32 w-full overflow-auto rounded-control bg-bg-sunken p-3 text-left font-sans tabular-nums text-[11px] text-red-text">
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
