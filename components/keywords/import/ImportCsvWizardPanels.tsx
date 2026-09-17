"use client";

import { hasActionWarning } from "@/components/keywords/action-utils";
import { LocationActionWarning } from "@/components/keywords/LocationActionWarning";
import { Button } from "@/components/ui/Button";
import { CopyButton } from "@/components/ui/CopyButton";
import type {
  KeywordImportColumnMapping,
  KeywordImportField,
  KeywordImportSourceColumn,
} from "@/lib/keywords/import-csv-parser";
import { keywordImportTemplateCsv } from "@/lib/keywords/import-csv-template";
import { downloadTextFile } from "@/lib/ui/download";
import { CheckCircleIcon as CheckCircle } from "@phosphor-icons/react/dist/csr/CheckCircle";
import { CircleNotchIcon as CircleNotch } from "@phosphor-icons/react/dist/csr/CircleNotch";
import { DownloadSimpleIcon as DownloadSimple } from "@phosphor-icons/react/dist/csr/DownloadSimple";
import { useTranslations } from "next-intl";
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

type CsvWizardTranslations = ReturnType<
  typeof useTranslations<"projectRankTracker.keywordImport.csvWizard">
>;

/**
 * Import actions predate the localized wizard and return stable English details.
 * Keep that action contract intact, but do not render an arbitrary server message.
 */
export function presentImportValidationMessage(message: string, t: CsvWizardTranslations) {
  if (message === "Could not resolve this row's market. Check its location and language.") {
    return t("rowMarketUnresolved");
  }
  if (
    message ===
    "Choose a market for rows without a location, or provide Country and Language or an exact Location key in this row."
  ) {
    return t("rowLocationRequired");
  }
  const locationKey = /^Location key (.+) could not be resolved exactly\.$/.exec(message)?.[1];
  if (locationKey) return t("rowLocationKeyUnresolved", { locationKey });
  const location =
    /^Location (.+) could not be resolved exactly\. Choose an existing market or use its exact Location key\.$/.exec(
      message,
    )?.[1];
  if (location) return t("rowLocationUnresolved", { location });
  const market = /^Market (.+) is not tracked by this project\. Add it in Markets first\.$/.exec(
    message,
  )?.[1];
  if (market) return t("rowMarketNotTracked", { market });
  return t("rowInvalid");
}

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

const csvExample = keywordImportTemplateCsv;

const codeDarkCopy = {
  "--control-color": "var(--code-faint)",
  "--control-hover-background-color": "color-mix(in srgb, var(--code-fg) 8%, transparent)",
  "--control-hover-color": "var(--code-fg)",
} as const;

function downloadTemplate(templateCsv: string) {
  downloadTextFile(templateCsv, "bisibility-keywords-template.csv", "text/csv;charset=utf-8");
}

export function TemplateStep({
  templateCsv = keywordImportTemplateCsv,
}: Readonly<{ templateCsv?: string }>) {
  const t = useTranslations("projectRankTracker.keywordImport.csvWizard");
  return (
    <div>
      <h3 className="m-0 text-[15px] font-semibold">{t("templateTitle")}</h3>
      <p className="m-0 mt-1.5 text-[13px] leading-[1.55] text-fg-muted">
        {t("templateDescription", { field: "keyword" })}
      </p>
      <p className="m-0 mt-2 text-[12px] leading-[1.5] text-fg-muted">{t("marketRequirement")}</p>
      <Button
        onClick={() => downloadTemplate(templateCsv)}
        startIcon={<DownloadSimple size={15} weight="regular" />}
        style={{ marginTop: "16px" }}
        type="button"
        variant="secondary"
      >
        {t("downloadTemplate")}
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
          <CopyButton label={t("copyTemplate")} size="sm" style={codeDarkCopy} text={templateCsv} />
        </div>
        <pre className="m-0 overflow-x-auto px-[15px] py-[13px] font-mono text-[11.5px] leading-[1.75] text-code-fg">
          {templateCsv}
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
  const t = useTranslations("projectRankTracker.keywordImport.csvWizard");
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
            {t("pasteCsv")}
          </label>
          <span className="font-sans tabular-nums text-[11px] text-fg-muted">
            {t("parsed", { count: parsedCount })}
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
  const t = useTranslations("projectRankTracker.keywordImport.csvWizard");
  const label = parsedCount === null ? t("workbookSelected") : t("found", { count: parsedCount });
  return (
    <div>
      <h3 className="m-0 text-[15px] font-semibold">{t("mapTitle")}</h3>
      <p className="m-0 mt-1.5 text-[13px] text-fg-muted">{label}</p>
      <p className="m-0 mt-2 text-[12px] leading-[1.5] text-fg-muted">{t("mappingHelp")}</p>
      {hasHeader ? (
        <ImportColumnMapping
          mapping={mapping}
          onChange={onMappingChange}
          sourceColumns={sourceColumns}
        />
      ) : (
        <p className="mt-4 rounded-card border border-border bg-bg-sunken px-4 py-3 text-[12px] leading-[1.5] text-fg-muted">
          {t("noHeader")}
        </p>
      )}
      <p className="m-0 mt-3 text-[12px] leading-[1.5] text-fg-muted">
        <span className="font-medium text-fg">{t("locationFields")}</span> {t("locationHelp")}
      </p>
      {isReviewing ? (
        <p
          aria-live="polite"
          className="mt-4 flex items-center gap-2 text-[12px] text-fg-muted"
          role="status"
        >
          <CircleNotch weight="regular" aria-hidden className="animate-spin" size={15} />
          {t("checkingMapped")}
        </p>
      ) : null}
    </div>
  );
}

export function ReviewStep({
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
  const t = useTranslations("projectRankTracker.keywordImport.csvWizard");
  const label =
    review === null
      ? t("checkingRows")
      : t("reviewReady", { duplicates: review.duplicateRows, rows: review.rows.length });
  return (
    <div>
      <h3 className="m-0 text-[15px] font-semibold">{t("reviewTitle")}</h3>
      <p className="m-0 mt-1.5 text-[13px] leading-[1.55] text-fg-muted">
        {t("reviewDescription")}
      </p>
      <ParsedRowsPreview rows={review?.rows ?? []} />
      {review?.rows.some((row) => row.marketStatus === "paused") ? (
        <p className="mt-3 text-[12px] text-fg-muted" role="status">
          {t("pausedMarkets")}
        </p>
      ) : null}
      {review?.errors.length ? (
        <div className="mt-4 rounded-card border border-border bg-bg-sunken px-4 py-3 text-[12px] leading-[1.5] text-red-text">
          {t("excluded", { count: review.errors.length })}
          <ul
            className="m-0 mt-2 max-h-40 list-none overflow-auto p-0"
            aria-label={t("validationErrors")}
          >
            {review.errors.map((error) => (
              <li key={`${error.row}-${error.message}`}>
                {t("rowError", {
                  message: presentImportValidationMessage(error.message, t),
                  row: error.row,
                })}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <div className="mt-4 rounded-card border border-border bg-bg-sunken px-4 py-3 font-sans tabular-nums text-[12px] text-fg-muted">
        {label}
      </div>
    </div>
  );
}

export function DoneStep({ result }: Readonly<{ result: ImportResultSummary }>) {
  const t = useTranslations("projectRankTracker.keywordImport.csvWizard");
  const warning = hasActionWarning(result) ? t("locationDegraded") : null;
  return (
    <div className="flex flex-col items-center px-4 py-[30px] text-center">
      <span className="grid h-14 w-14 place-items-center rounded-card text-green-text [background:color-mix(in_srgb,var(--green)_12%,transparent)]">
        <CheckCircle size={30} weight="regular" />
      </span>
      <h3 className="m-0 mt-4.5 text-[18px] font-semibold tracking-[-0.4px]">{t("complete")}</h3>
      <p className="m-0 mt-[7px] max-w-[340px] text-[13.5px] leading-[1.55] text-fg-muted">
        {t("summary", result)}
      </p>
      <LocationActionWarning message={warning} />
      {result.errors.length ? (
        <div className="mt-4 max-h-32 w-full overflow-auto rounded-control bg-bg-sunken p-3 text-left font-sans tabular-nums text-[11px] text-red-text">
          {result.errors.slice(0, 6).map((error) => (
            <div key={`${error.row}-${error.message}`}>
              {t("rowError", {
                message: presentImportValidationMessage(error.message, t),
                row: error.row,
              })}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
