"use client";

import { actionErrorMessage } from "@/components/keywords/action-utils";
import { Sheet } from "@/components/ui";
import {
  importKeywordsFromCsv,
  previewKeywordImportFile,
} from "@/lib/actions/keyword-import-export";
import { refreshKeywordViewsAfterImport } from "@/lib/actions/keyword-import-refresh";
import { zodResolver } from "@/lib/forms/zod-resolver";
import { parseCsvKeywordsResult } from "@/lib/keywords/add-keyword-drawer-shared";
import { KEYWORD_IMPORT_MAX, keywordImportFileLimitMessage } from "@/lib/schemas/keyword";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { ImportCsvWizardFooter } from "./ImportCsvWizardFooter";
import { DoneStep, MapStep, ReviewStep, TemplateStep, UploadStep } from "./ImportCsvWizardPanels";
import { ImportStepper } from "./ImportCsvWizardSteps";
import { type ImportWizardForm, importWizardSchema } from "./import-csv-wizard-schema";

type ImportResult = Awaited<ReturnType<typeof importKeywordsFromCsv>>;
// biome-ignore format: compact server-action result type keeps the wizard under the file line cap.
type ImportFileRows = Extract<Awaited<ReturnType<typeof previewKeywordImportFile>>, { ok: true }>["rows"];
type ParsedCount = number | null;

type ImportCsvWizardProps = {
  onClose: () => void;
  open: boolean;
  projectId?: string;
};

function importPrimaryLabel(step: number, importFile: File | null, count: number) {
  if (step === 4) return importFile ? "Import workbook" : `Import ${count} keywords`;
  return step === 5 ? "Done" : "Continue";
}

function WizardBody({
  actionError,
  csvText,
  errorMessage,
  importFile,
  onCsvTextChange,
  onCsvFileError,
  onUnsupportedFile,
  onWorkbookFileChange,
  parsedCount,
  parsedRows,
  result,
  step,
}: Readonly<{
  actionError: string | null;
  csvText: string;
  errorMessage?: string;
  importFile: File | null;
  onCsvTextChange: (value: string) => void;
  onCsvFileError: (message: string) => void;
  onUnsupportedFile: () => void;
  onWorkbookFileChange: (file?: File) => void;
  parsedCount: ParsedCount;
  parsedRows: ReturnType<typeof parseCsvKeywordsResult>["rows"] | null;
  result: ImportResult | null;
  step: number;
}>) {
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
      {step === 3 ? <MapStep parsedCount={parsedCount} parsedRows={parsedRows} /> : null}
      {step === 4 ? <ReviewStep parsedCount={parsedCount} parsedRows={parsedRows} /> : null}
      {step === 5 && result ? <DoneStep result={result} /> : null}
      {actionError ? (
        <p className="mt-3 font-mono text-[11.5px] text-red-text">{actionError}</p>
      ) : null}
    </>
  );
}

export function ImportCsvWizard({ onClose, open, projectId }: Readonly<ImportCsvWizardProps>) {
  const router = useRouter();
  const [actionError, setActionError] = useState<string | null>(null);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importFileRows, setImportFileRows] = useState<ImportFileRows | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
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
  const parsedCount: ParsedCount = importFile ? (importFileRows?.length ?? null) : csvParsedCount;
  const parsedRows = importFile ? importFileRows : csvParseResult.rows;
  const canImport = importFile
    ? Boolean(importFileRows?.length)
    : !csvParseError && csvParsedCount > 0;
  const primaryLabel = importPrimaryLabel(step, importFile, csvParsedCount);

  async function close() {
    const shouldRefresh = result !== null;
    workbookPreviewRequest.current += 1;
    setActionError(null);
    setImportFile(null);
    setImportFileRows(null);
    setResult(null);
    setStep(1);
    reset({ csv: "", duplicateMode: "skip", projectId, refresh: "deferred" });
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
    setStep((value) => Math.min(4, value + 1));
  }

  function updateCsv(value: string) {
    workbookPreviewRequest.current += 1;
    setActionError(null);
    setImportFile(null);
    setImportFileRows(null);
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
    setImportFileRows(null);
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
      setImportFileRows(preview.rows);
    } catch (error) {
      if (request !== workbookPreviewRequest.current) return;
      setImportFile(null);
      setError("csv", { message: actionErrorMessage(error) });
    }
  }

  function handleUnsupportedFile() {
    workbookPreviewRequest.current += 1;
    setImportFile(null);
    setImportFileRows(null);
    setError("csv", { message: "Choose a CSV or XLSX file. Save legacy .xls files as .xlsx." });
  }

  function handleCsvFileError(message: string) {
    workbookPreviewRequest.current += 1;
    setImportFile(null);
    setImportFileRows(null);
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
        const importResult = await importKeywordsFromCsv(input);
        setResult(importResult);
      } else {
        const importResult = await importKeywordsFromCsv(values);
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
          canImport={canImport}
          confirmImport={handleSubmit(save)}
          isSubmitting={isSubmitting}
          next={next}
          primaryLabel={primaryLabel}
          setStep={setStep}
          step={step}
        />
      }
      onClose={close}
      open={open}
      title={
        <span className="block">
          <span className="block">Import keywords from CSV</span>
          <span className="mt-1 block text-[13px] font-normal tracking-normal text-fg-muted">
            Bulk-add keywords from CSV or XLSX.
          </span>
          <ImportStepper step={step} />
        </span>
      }
      widthVariant="form"
    >
      <form onSubmit={(event) => event.preventDefault()}>
        <WizardBody
          actionError={actionError}
          csvText={csvText ?? ""}
          errorMessage={errors.csv?.message ?? csvParseError ?? undefined}
          importFile={importFile}
          onCsvTextChange={updateCsv}
          onCsvFileError={handleCsvFileError}
          onUnsupportedFile={handleUnsupportedFile}
          onWorkbookFileChange={updateWorkbookFile}
          parsedCount={parsedCount}
          parsedRows={parsedRows}
          result={result}
          step={step}
        />
      </form>
    </Sheet>
  );
}
