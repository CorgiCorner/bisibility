"use client";

import { dataTableColumnId } from "@/components/ui/data-table/data-table-model";
import type { DataTableColumn } from "@/components/ui/data-table/data-table-types";
import type { KeywordRow } from "@/lib/queries/keywords";
import type { KeywordPersonalViewContext } from "@/lib/saved-views/keyword-personal-context";
import {
  emptyTablePresentation,
  type TablePresentation,
} from "@/lib/saved-views/presentation-model";
import { resolveTablePresentation } from "@/lib/saved-views/presentation-resolver";
import { useContext, useState } from "react";
import { KeywordPresentationDraftContext } from "./KeywordPresentationDraftProvider";
import { defaultKeywordColumnVisibility } from "./keyword-data-table-config";

export function usePersonalKeywordLayout(
  context: Pick<KeywordPersonalViewContext, "presentation"> | undefined,
  columns: readonly DataTableColumn<KeywordRow>[],
) {
  const shared = useContext(KeywordPresentationDraftContext);
  const [localDraft, setLocalDraft] = useState<TablePresentation | null>(
    () => context?.presentation ?? null,
  );
  const draft = shared ? shared.draft : localDraft;
  const setDraft = shared ? shared.setDraft : setLocalDraft;
  const registry = {
    version: 1,
    columns: columns.flatMap((column) => {
      const id = dataTableColumnId(column);
      if (!id) return [];
      const width = column.size ?? 160;
      return [
        {
          id,
          defaultVisible: defaultKeywordColumnVisibility[id] ?? true,
          defaultWidth: width,
          lockedVisible: column.meta?.lockVisible === true,
          minWidth: column.meta?.lockResize ? width : (column.minSize ?? 80),
          maxWidth: column.meta?.lockResize ? width : (column.maxSize ?? 4096),
        },
      ];
    }),
  };
  const resolved = resolveTablePresentation(registry, draft);
  const baseline = resolveTablePresentation(registry, context?.presentation ?? null);
  return {
    modified: JSON.stringify(resolved.presentation) !== JSON.stringify(baseline.presentation),
    presentation: resolved.presentation,
    partial: resolved.partial,
    sizing: resolved.presentation.sizing,
    visibility: resolved.presentation.visibility,
    order: resolved.presentation.columnOrder,
    setSizing: (sizing: Record<string, number>) =>
      setDraft((current) => ({ ...(current ?? emptyTablePresentation), sizing })),
    setVisibility: (visibility: Record<string, boolean>) =>
      setDraft((current) => ({ ...(current ?? emptyTablePresentation), visibility })),
    setOrder: (columnOrder: readonly string[]) =>
      setDraft((current) => ({
        ...(current ?? emptyTablePresentation),
        columnOrder: [...columnOrder],
      })),
    discard: () => setDraft(context?.presentation ?? null),
  };
}
