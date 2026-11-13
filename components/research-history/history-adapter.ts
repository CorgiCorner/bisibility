import type {
  HistoryChip,
  HistoryPage,
  HistoryQuery,
  HistoryRow,
} from "@/lib/research-history/contract";
import type { ReactNode } from "react";

export type HistoryAdapter = {
  allHref?: string;
  chipLabel: (chip: HistoryChip) => string;
  loadPage: (input: HistoryQuery) => Promise<HistoryPage>;
  noun: "checks" | "runs";
  onOpen: (row: HistoryRow) => void | Promise<void>;
  onTogglePin: (row: HistoryRow, pinned: boolean) => Promise<boolean>;
  renderMeta: (row: HistoryRow) => ReactNode;
  searchPlaceholder: string;
};
