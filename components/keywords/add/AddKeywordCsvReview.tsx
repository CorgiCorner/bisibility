"use client";

import type { CsvKeywordReviewItem } from "@/components/keywords/AddKeywordCsvReviewModel";
import { Button } from "@/components/ui";
import { ArrowLeftIcon as ArrowLeft, CheckCircleIcon as CheckCircle } from "@phosphor-icons/react";

type AddKeywordCsvReviewProps = {
  items: CsvKeywordReviewItem[];
  onEdit: () => void;
};

function itemMetadata(item: CsvKeywordReviewItem) {
  return [
    item.locationLabel,
    item.device,
    item.targetUrl,
    item.tags.length > 0 ? item.tags.join(", ") : null,
  ]
    .filter(Boolean)
    .join(" | ");
}

function ItemStatus({ item }: Readonly<{ item: CsvKeywordReviewItem }>) {
  if (item.issues[0]) {
    return (
      <span className="ml-auto flex-none rounded-full bg-bg-sunken px-2 py-0.5 font-mono text-[10.5px] text-red-text">
        Row {item.row}: {item.issues[0].message}
      </span>
    );
  }
  if (item.alreadyTracked) {
    return (
      <span className="ml-auto flex-none rounded-full bg-bg-sunken px-2 py-0.5 font-mono text-[10.5px] text-yellow-text">
        Already tracked - will be skipped
      </span>
    );
  }
  return null;
}

export function AddKeywordCsvReview({ items, onEdit }: Readonly<AddKeywordCsvReviewProps>) {
  const preview = items.slice(0, 10);
  const remaining = Math.max(0, items.length - preview.length);
  const alreadyTracked = items.filter((item) => item.alreadyTracked).length;
  const invalidRows = items.filter((item) => item.issues.length > 0).length;

  return (
    <div className="grid gap-4">
      <div className="rounded-[11px] border border-border bg-bg-sunken px-4 py-3">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 grid h-8 w-8 flex-none place-items-center rounded-[9px] bg-accent-soft text-accent-text">
            <CheckCircle size={18} weight="bold" />
          </span>
          <div className="min-w-0">
            <h3 className="m-0 text-[14px] font-semibold text-fg">Review keywords</h3>
            <p className="m-0 mt-1 text-[12.5px] leading-[1.5] text-fg-muted">
              {items.length} {items.length === 1 ? "keyword" : "keywords"} parsed from CSV.
              {alreadyTracked > 0 ? ` ${alreadyTracked} already tracked and will be skipped.` : ""}
              {invalidRows > 0 ? ` ${invalidRows} need edits before import.` : ""}
            </p>
          </div>
        </div>
      </div>
      <div className="overflow-hidden rounded-[11px] border border-border">
        {preview.map((item) => (
          <div
            className="flex items-center gap-3 border-t border-border-soft px-3.5 py-2.5 first:border-t-0"
            key={item.key}
          >
            <span className="w-6 flex-none font-mono text-[11px] text-fg-muted">
              {item.position}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-medium text-fg">
                {item.keyword || `Row ${item.row}`}
              </span>
              <span className="block truncate font-mono text-[10.5px] text-fg-muted">
                {itemMetadata(item)}
              </span>
            </span>
            <ItemStatus item={item} />
          </div>
        ))}
        {remaining > 0 ? (
          <div className="border-t border-border-soft px-3.5 py-2.5 font-mono text-[11px] text-fg-muted">
            +{remaining} more
          </div>
        ) : null}
      </div>
      <Button
        onClick={onEdit}
        size="sm"
        startIcon={<ArrowLeft size={13} weight="bold" />}
        sx={{ alignSelf: "flex-start", color: "var(--fg-muted)", width: "max-content" }}
        type="button"
        variant="secondary"
      >
        Edit CSV
      </Button>
    </div>
  );
}
