import type {
  importKeywordsFromCsv,
  previewKeywordImportFile,
  reviewKeywordImport,
} from "@/lib/actions/keyword-import-export";
import type { KeywordImportMarketContext } from "@/lib/keywords/import-market-context";
import type { useTranslations } from "next-intl";

export type ImportResult = Awaited<ReturnType<typeof importKeywordsFromCsv>>;
export type ImportReview = Awaited<ReturnType<typeof reviewKeywordImport>>;
export type ImportFilePreview = Extract<
  Awaited<ReturnType<typeof previewKeywordImportFile>>,
  { ok: true }
>;

export type ImportCsvWizardProps = {
  marketContext?: KeywordImportMarketContext;
  onClose: () => void;
  open: boolean;
  projectId?: string;
};

export function previewErrorMessage(
  code: unknown,
  t: ReturnType<typeof useTranslations<"projectRankTracker.keywordImport.csvWizard">>,
) {
  if (code === "missing_required_column") return t("missingKeywordColumn");
  if (code === "invalid_encoding") return t("csvInvalidEncoding");
  if (code === "malformed_csv") return t("csvMalformed");
  if (code === "unsupported_delimiter") return t("csvUnsupportedDelimiter");
  return t("previewFailed");
}
