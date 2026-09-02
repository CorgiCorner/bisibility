import type {
  importKeywordsFromCsv,
  reviewKeywordImport,
} from "@/lib/actions/keyword-import-export";
import type {
  KeywordImportColumnMapping,
  KeywordImportField,
  KeywordImportSourceColumn,
} from "@/lib/keywords/import-csv-parser";
import { DoneStep, MapStep, ReviewStep, TemplateStep, UploadStep } from "./ImportCsvWizardPanels";

type ImportResult = Awaited<ReturnType<typeof importKeywordsFromCsv>>;
type ImportReview = Awaited<ReturnType<typeof reviewKeywordImport>>;

type ImportCsvWizardBodyProps = {
  actionError: string | null;
  csvText: string;
  errorMessage?: string;
  hasHeader: boolean;
  importFile: File | null;
  isReviewing: boolean;
  mapping: KeywordImportColumnMapping;
  onCsvTextChange: (value: string) => void;
  onCsvFileError: (message: string) => void;
  onMappingChange: (sourceIndex: number, destination: KeywordImportField | null) => void;
  onUnsupportedFile: () => void;
  onWorkbookFileChange: (file?: File) => void;
  parsedCount: number | null;
  result: ImportResult | null;
  review: ImportReview | null;
  sourceColumns: readonly KeywordImportSourceColumn[];
  step: number;
};

export function ImportCsvWizardBody({
  actionError,
  csvText,
  errorMessage,
  hasHeader,
  importFile,
  isReviewing,
  mapping,
  onCsvTextChange,
  onCsvFileError,
  onMappingChange,
  onUnsupportedFile,
  onWorkbookFileChange,
  parsedCount,
  result,
  review,
  sourceColumns,
  step,
}: Readonly<ImportCsvWizardBodyProps>) {
  return (
    <>
      {step === 1 ? <TemplateStep /> : null}
      {step === 2 ? (
        <UploadStep
          csvText={csvText}
          errorMessage={errorMessage}
          importFile={importFile}
          onCsvTextChange={onCsvTextChange}
          onCsvFileError={onCsvFileError}
          onUnsupportedFile={onUnsupportedFile}
          onWorkbookFileChange={onWorkbookFileChange}
          parsedCount={parsedCount ?? 0}
        />
      ) : null}
      {step === 3 ? (
        <MapStep
          hasHeader={hasHeader}
          isReviewing={isReviewing}
          mapping={mapping}
          onMappingChange={onMappingChange}
          parsedCount={parsedCount}
          sourceColumns={sourceColumns}
        />
      ) : null}
      {step === 4 ? <ReviewStep parsedCount={parsedCount} review={review} /> : null}
      {step === 5 && result ? <DoneStep result={result} /> : null}
      {actionError ? (
        <p className="mt-3 font-sans tabular-nums text-[11.5px] text-red-text">{actionError}</p>
      ) : null}
    </>
  );
}
