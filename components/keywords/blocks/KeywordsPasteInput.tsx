"use client";

import { FieldLabel } from "@/components/ui/FieldLabel";
import { useTranslations } from "next-intl";
import { type KeywordPasteError, parseKeywordPaste } from "./keyword-paste-parser";

export type KeywordsPasteInputProps = {
  count: (validRows: number) => void;
  onChange: (value: string) => void;
  value: string;
};

function pasteErrorLabel(
  error: KeywordPasteError,
  t: ReturnType<typeof useTranslations<"projectRankTracker.keywordImport.management.add">>,
) {
  if (error.code === "duplicate_keyword") return t("pasteDuplicateKeyword");
  if (error.code === "missing_keyword") return t("pasteMissingKeyword");
  return t("pasteInvalidTargetUrl", { target: error.target });
}

export function KeywordsPasteInput({ count, onChange, value }: Readonly<KeywordsPasteInputProps>) {
  const t = useTranslations("projectRankTracker.keywordImport.management.add");
  const rows = parseKeywordPaste(value);
  const validRows = rows.filter((row) => row.error === null && row.keyword !== "").length;
  const errors = rows.filter((row) => row.error !== null);
  const describedBy =
    errors.map((row) => `keywords-paste-error-${row.line}`).join(" ") || undefined;

  function change(nextValue: string) {
    const nextRows = parseKeywordPaste(nextValue);
    count(nextRows.filter((row) => row.error === null && row.keyword !== "").length);
    onChange(nextValue);
  }

  return (
    <section aria-label={t("pasteInput")} className="grid gap-2">
      <FieldLabel htmlFor="keywords-paste" label={t("keywords")} />
      <textarea
        aria-describedby={describedBy}
        aria-label={t("keywords")}
        className="min-h-32 w-full rounded-control border border-border-control bg-transparent p-3 text-[13px] text-fg outline-none focus:border-accent"
        id="keywords-paste"
        onChange={(event) => change(event.target.value)}
        placeholder={t("pastePlaceholder")}
        value={value}
      />
      <p className="m-0 text-[12px] text-fg-muted">{t("validKeywords", { count: validRows })}</p>
      {errors.map((row) => (
        <p
          className="m-0 text-[12px] text-red-text"
          id={`keywords-paste-error-${row.line}`}
          key={row.line}
        >
          {t("pasteLineError", {
            line: row.line,
            message: row.error ? pasteErrorLabel(row.error, t) : "",
          })}
        </p>
      ))}
    </section>
  );
}
