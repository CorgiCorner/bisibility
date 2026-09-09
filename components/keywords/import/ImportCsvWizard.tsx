"use client";

import { actionErrorMessage } from "@/components/keywords/action-utils";
import {
  importKeywordsFromCsv,
  previewKeywordImportFile,
  reviewKeywordImport,
} from "@/lib/actions/keyword-import-export";
import { refreshKeywordViewsAfterImport } from "@/lib/actions/keyword-import-refresh";
import { zodResolver } from "@/lib/forms/zod-resolver";
import { parseCsvKeywordsResult } from "@/lib/keywords/add-keyword-drawer-shared";
import type { KeywordImportColumnMapping } from "@/lib/keywords/import-csv-parser";
import { keywordImportTemplateForMarkets } from "@/lib/keywords/import-csv-template";
import {
  initialImportMarketKey,
  type KeywordImportMarketContext,
} from "@/lib/keywords/import-market-context";
import {
  keywordImportWizardInput,
  updateKeywordImportMapping,
} from "@/lib/keywords/import-wizard-input";
import { KEYWORD_IMPORT_MAX, keywordImportFileLimitMessage } from "@/lib/schemas/keyword";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { ImportCsvWizardBody } from "./ImportCsvWizardBody";
import { ImportCsvWizardFooter } from "./ImportCsvWizardFooter";
import { ImportCsvWizardFrame } from "./ImportCsvWizardFrame";
import { type ImportWizardForm, importWizardSchema } from "./import-csv-wizard-schema";

type ImportResult = Awaited<ReturnType<typeof importKeywordsFromCsv>>;
type ImportReview = Awaited<ReturnType<typeof reviewKeywordImport>>;
// biome-ignore format: compact server-action result type keeps the wizard under the file line cap.
type ImportFilePreview = Extract<Awaited<ReturnType<typeof previewKeywordImportFile>>, { ok: true }>;
type ImportCsvWizardProps = {
  marketContext?: KeywordImportMarketContext;
  onClose: () => void;
  open: boolean;
  projectId?: string;
};

export function ImportCsvWizard({
  marketContext,
  onClose,
  open,
  projectId,
}: Readonly<ImportCsvWizardProps>) {
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
    defaultValues: {
      defaultMarketKey: initialImportMarketKey(marketContext),
      csv: "",
      duplicateMode: "skip",
      projectId,
      refresh: "deferred",
    },
    resolver: zodResolver(importWizardSchema),
  });
  const csvText = watch("csv");
  const defaultMarketKey = watch("defaultMarketKey");
  const hasMarkets = marketContext === undefined || marketContext.markets.length > 0;
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
    reset({
      defaultMarketKey: initialImportMarketKey(marketContext),
      csv: "",
      duplicateMode: "skip",
      projectId,
      refresh: "deferred",
    });
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
    if (!hasMarkets) return;
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
        const input = keywordImportWizardInput({
          file: importFile,
          columnMapping,
          csv: csvText ?? "",
          defaultMarketKey,
          projectId,
          refresh: "deferred",
        });
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
      if (!hasMarkets || !review?.rows.length) return;
      setResult(
        await importKeywordsFromCsv(
          keywordImportWizardInput({ ...values, file: importFile, columnMapping }),
        ),
      );
      setStep(5);
    } catch (error) {
      setActionError(actionErrorMessage(error));
    }
  }
  return (
    <ImportCsvWizardFrame
      marketContext={marketContext}
      pending={isSubmitting || isReviewing}
      projectId={projectId}
      selectedMarketKey={defaultMarketKey}
      step={step}
      onMarketChange={(key) => {
        setValue("defaultMarketKey", key, { shouldDirty: true });
        setReview(null);
        if (step === 4) setStep(3);
      }}
      footer={
        <ImportCsvWizardFooter
          hasMarkets={hasMarkets}
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
    >
      <ImportCsvWizardBody
        templateCsv={keywordImportTemplateForMarkets(
          marketContext?.markets.map((market) => market.canonicalKey) ?? [],
          defaultMarketKey,
        )}
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
          setColumnMapping((current) =>
            updateKeywordImportMapping(current, sourceIndex, destination),
          );
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
    </ImportCsvWizardFrame>
  );
}
