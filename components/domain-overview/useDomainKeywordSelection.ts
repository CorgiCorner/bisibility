"use client";

import type { RankedKeywordRow } from "@/lib/providers/types";
import { useState } from "react";
import type { SaveDomainKeywords } from "./domain-overview-keyword-tracking";

const number = new Intl.NumberFormat("en-US");

function selectionKey(row: RankedKeywordRow) {
  return `${row.keyword}\u0000${row.rankingUrl ?? ""}`;
}

export function useDomainKeywordSelection(
  rows: readonly RankedKeywordRow[],
  onSaveSelected?: SaveDomainKeywords,
) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [saving, setSaving] = useState(false);
  const [savingMessage, setSavingMessage] = useState<string | null>(null);
  const selectedRows = rows.filter((row) => selected.has(selectionKey(row)));
  const allSelected = rows.length > 0 && selectedRows.length === rows.length;

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(rows.map((row) => selectionKey(row))));
    setSavingMessage(null);
  }

  function toggleRow(row: RankedKeywordRow) {
    const key = selectionKey(row);
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
    setSavingMessage(null);
  }

  async function saveSelected() {
    if (!onSaveSelected || selectedRows.length === 0) return;
    setSaving(true);
    setSavingMessage(null);
    try {
      const result = await onSaveSelected(selectedRows);
      setSelected(new Set());
      setSavingMessage(
        result.savedCount > 0
          ? `${number.format(result.savedCount)} ${result.savedCount === 1 ? "keyword" : "keywords"} added to Saved`
          : "No new saved keywords",
      );
    } catch {
      setSavingMessage("Selected keywords were not added to Saved");
    } finally {
      setSaving(false);
    }
  }

  return {
    allSelected,
    isSelected: (row: RankedKeywordRow) => selected.has(selectionKey(row)),
    selectedRows,
    toggleAll,
    toggleRow,
    saveSelected,
    saving,
    savingMessage,
  };
}
