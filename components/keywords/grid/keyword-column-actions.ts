import type { KeywordRow } from "@/lib/queries/keywords";

export type KeywordColumnActions = {
  canDeleteKeyword: boolean;
  canUpdateKeyword: boolean;
  onDelete: (row: KeywordRow) => void;
  onEdit: (row: KeywordRow) => void;
  onRunCheck: (row: KeywordRow) => void;
};
