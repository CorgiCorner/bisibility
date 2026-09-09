"use client";

import { FieldLabel } from "@/components/ui/FieldLabel";
import { parseKeywordPaste } from "./keyword-paste-parser";

export type KeywordsPasteInputProps = {
  count: (validRows: number) => void;
  onChange: (value: string) => void;
  value: string;
};

export function KeywordsPasteInput({ count, onChange, value }: Readonly<KeywordsPasteInputProps>) {
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
    <section aria-label="Keyword paste input" className="grid gap-2">
      <FieldLabel htmlFor="keywords-paste" label="Keywords" />
      <textarea
        aria-describedby={describedBy}
        aria-label="Keywords"
        className="min-h-32 w-full rounded-control border border-border-control bg-transparent p-3 text-[13px] text-fg outline-none focus:border-accent"
        id="keywords-paste"
        onChange={(event) => change(event.target.value)}
        placeholder="keyword | Target URL"
        value={value}
      />
      <p className="m-0 text-[12px] text-fg-muted">{validRows} valid keywords</p>
      {errors.map((row) => (
        <p
          className="m-0 text-[12px] text-red-text"
          id={`keywords-paste-error-${row.line}`}
          key={row.line}
        >
          Line {row.line}: {row.error}
        </p>
      ))}
    </section>
  );
}
