"use client";

import { actionErrorMessage } from "@/components/keywords/action-utils";
import { Sheet } from "@/components/ui";
import {
  importKeywordsFromCsv,
  previewKeywordImportFile,
  reviewKeywordImport,
} from "@/lib/actions/keyword-import-export";
import { refreshKeywordViewsAfterImport } from "@/lib/actions/keyword-import-refresh";
import { zodResolver } from "@/lib/forms/zod-resolver";
import { parseCsvKeywordsResult } from "@/lib/keywords/add-keyword-drawer-shared";
import type { KeywordImportColumnMapping } from "@/lib/keywords/import-csv-parser";
import { KEYWORD_IMPORT_MAX, keywordImportFileLimitMessage } from "@/lib/schemas/keyword";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { ImportCsvWizardBody } from "./ImportCsvWizardBody";
import { ImportCsvWizardFooter } from "./ImportCsvWizardFooter";
import { ImportStepper } from "./ImportCsvWizardSteps";
import { type ImportWizardForm, importWizardSchema } from "./import-csv-wizard-schema";

type ImportResult = Awaited<ReturnType<typeof importKeywordsFromCsv>>;
type ImportReview = Awaited<ReturnType<typeof reviewKeywordImport>>;
// biome-ignore format: compact server-action result type keeps the wizard under the file line cap.
type ImportFilePreview = Extract<Awaited<ReturnType<typeof previewKeywordImportFile>>, { ok: true }>;
type ImportCsvWizardProps = {
  onClose: () => void;
  open: boolean;
  projectId?: string;
};

export function ImportCsvWizard({ onClose, open, projectId }: Readonly<ImportCsvWizardProps>) {
  const router = useRouter();
  const [actionError, setActionError] = useState<string | null>(null);
  const [columnMapping, setColumnMapping] = useState<KeywordImportColumnMapping>({});
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importFilePreview, setImportFilePreview] = useState<ImportFilePreview | null>(null);
  const [isReviewing, setIsReviewing] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [review, setReview] = useState<ImportReview | null>(null);
  const [step, setStep] = useState(1);
  const workbookPreviewRequest = useRef(0);
  const {
    clearErrors,
    formState: { errors, isSubmitting },
    handleSubmit,
    reset,
    setError,
    setValue,
    trigger,
    watch,
  } = useForm<ImportWizardForm>({
    defaultValues: { csv: "", duplicateMode: "skip", projectId, refresh: "deferred" },
    resolver: zodResolver(importWizardSchema),
  });
  const csvText = watch("csv");
  const csvParseResult = useMemo(() => parseCsvKeywordsResult(csvText ?? ""), [csvText]);
  const csvParsedCount = csvParseResult.keywords.length;
  const csvReceivedCount = csvParseResult.rows.length;
  const csvLimitError =
    csvReceivedCount > KEYWORD_IMPORT_MAX ? keywordImportFileLimitMessage(csvReceivedCount) : null;
  const csvParseError = importFile ? null : (csvParseResult.error ?? csvLimitError);
  const importFileRows = importFilePreview?.rows ?? null;
  const parsedCount = importFile ? (importFileRows?.length ?? null) : csvParsedCount;
  const hasHeader = importFile ? (importFilePreview?.hasHeader ?? false) : csvParseResult.hasHeader;
  const sourceColumns = importFile
    ? (importFilePreview?.sourceColumns ?? [])
    : csvParseResult.sourceColumns;
  const canImport = importFile
    ? Boolean(importFileRows?.length)
    : !csvParseError && csvParsedCount > 0;
  function resetWizard() {
    workbookPreviewRequest.current += 1;
    setActionError(null);
    setColumnMapping({});
    setImportFile(null);
    setImportFilePreview(null);
    setIsReviewing(false);
    setResult(null);
    setReview(null);
    setStep(1);
    reset({ csv: "", duplicateMode: "skip", projectId, refresh: "deferred" });
  }

  async function close() {
    const shouldRefresh = result !== null;
    resetWizard();
    onClose();
    if (shouldRefresh) {
      await refreshKeywordViewsAfterImport();
      router.refresh();
    }
  }

  async function next() {
    if (step === 5) {
      await close();
      return;
    }
    if (step === 2) {
      if (csvParseError) {
        setError("csv", { message: csvParseError });
        return;
      }
      if (!canImport) {
        setError("csv", { message: "Upload an XLSX workbook or paste CSV rows." });
        return;
      }
      if (!importFile && !(await trigger("csv"))) return;
      clearErrors("csv");
    }
    if (step === 3) {
      setActionError(null);
      setIsReviewing(true);
      try {
        const input = importFile
          ? (() => {
              const formData = new FormData();
              formData.set("file", importFile);
              if (projectId) formData.set("projectId", projectId);
              formData.set("refresh", "deferred");
              if (Object.keys(columnMapping).length) {
                formData.set("columnMapping", JSON.stringify(columnMapping));
              }
              return formData;
            })()
          : { columnMapping, csv: csvText ?? "", projectId, refresh: "deferred" as const };
        setReview(await reviewKeywordImport(input));
      } catch (error) {
        setActionError(actionErrorMessage(error));
        return;
      } finally {
        setIsReviewing(false);
      }
    }
    setStep((value) => Math.min(4, value + 1));
  }

  function updateCsv(value: string) {
    workbookPreviewRequest.current += 1;
    setActionError(null);
    setColumnMapping(parseCsvKeywordsResult(value).columnMapping);
    setImportFile(null);
    setImportFilePreview(null);
    setReview(null);
    clearErrors("csv");
    setValue("csv", value, { shouldDirty: true, shouldValidate: true });
  }

  async function updateWorkbookFile(file?: File) {
    if (!file) return;
    const request = workbookPreviewRequest.current + 1;
    workbookPreviewRequest.current = request;
    setActionError(null);
    clearErrors("csv");
    setImportFile(file);
    setImportFilePreview(null);
    setReview(null);
    setValue("csv", "", { shouldDirty: true, shouldValidate: false });
    const input = new FormData();
    input.set("file", file);
    try {
      const preview = await previewKeywordImportFile(input);
      if (request !== workbookPreviewRequest.current) return;
      if (!preview.ok) {
        setImportFile(null);
        setError("csv", { message: preview.error.message });
        return;
      }
      setColumnMapping(preview.columnMapping ?? {});
      setImportFilePreview(preview);
    } catch (error) {
      if (request !== workbookPreviewRequest.current) return;
      setImportFile(null);
      setError("csv", { message: actionErrorMessage(error) });
    }
  }

  function handleUnsupportedFile() {
    workbookPreviewRequest.current += 1;
    setImportFile(null);
    setImportFilePreview(null);
    setColumnMapping({});
    setReview(null);
    setError("csv", { message: "Choose a CSV or XLSX file. Save legacy .xls files as .xlsx." });
  }

  function handleCsvFileError(message: string) {
    workbookPreviewRequest.current += 1;
    setImportFile(null);
    setImportFilePreview(null);
    setColumnMapping({});
    setReview(null);
    setValue("csv", "", { shouldDirty: true, shouldValidate: false });
    setError("csv", { message });
  }

  async function save(values: ImportWizardForm) {
    setActionError(null);
    try {
      if (importFile) {
        const input = new FormData();
        input.set("file", importFile);
        if (values.projectId) input.set("projectId", values.projectId);
        input.set("refresh", values.refresh);
        if (Object.keys(columnMapping).length) {
          input.set("columnMapping", JSON.stringify(columnMapping));
        }
        const importResult = await importKeywordsFromCsv(input);
        setResult(importResult);
      } else {
        const importResult = await importKeywordsFromCsv({ ...values, columnMapping });
        setResult(importResult);
      }
      setStep(5);
    } catch (error) {
      setActionError(actionErrorMessage(error));
    }
  }
  return (
    <Sheet
      footer={
        <ImportCsvWizardFooter
          canImport={
            canImport &&
            (step !== 3 || !hasHeader || columnMapping.keyword !== undefined) &&
            (step !== 4 || Boolean(review?.rows.length))
          }
          confirmImport={handleSubmit(save)}
          isReviewing={isReviewing}
          isSubmitting={isSubmitting}
          next={next}
          setStep={setStep}
          startOver={resetWizard}
          step={step}
        />
      }
      onClose={close}
      open={open}
      title={
        <span className="block">
          <span className="block">Import keywords</span>
          <span className="mt-1 block text-[13px] font-normal tracking-normal text-fg-muted">
            Bulk-add keywords from CSV or XLSX.
          </span>
          <ImportStepper step={step} />
        </span>
      }
      widthVariant="form"
    >
      <form onSubmit={(event) => event.preventDefault()}>
        <ImportCsvWizardBody
          actionError={actionError}
          csvText={csvText ?? ""}
          errorMessage={errors.csv?.message ?? csvParseError ?? undefined}
          hasHeader={hasHeader}
          importFile={importFile}
          isReviewing={isReviewing}
          mapping={columnMapping}
          onCsvTextChange={updateCsv}
          onCsvFileError={handleCsvFileError}
          onMappingChange={(sourceIndex, destination) => {
            setColumnMapping((current) => {
              const next = Object.fromEntries(
                Object.entries(current).filter(
                  ([field, index]) => index !== sourceIndex && field !== destination,
                ),
              ) as KeywordImportColumnMapping;
              return destination ? { ...next, [destination]: sourceIndex } : next;
            });
            setReview(null);
          }}
          onUnsupportedFile={handleUnsupportedFile}
          onWorkbookFileChange={updateWorkbookFile}
          parsedCount={parsedCount}
          review={review}
          result={result}
          step={step}
          sourceColumns={sourceColumns}
        />
      </form>
    </Sheet>
  );
}
