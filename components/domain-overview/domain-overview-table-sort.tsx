import { CaretDownIcon as CaretDown } from "@phosphor-icons/react/dist/csr/CaretDown";
import { CaretUpIcon as CaretUp } from "@phosphor-icons/react/dist/csr/CaretUp";
import type { useTranslations } from "next-intl";
import type { ReactNode } from "react";

export type SortDirection = "asc" | "desc";

type SortValue = number | string | null;

type DomainOverviewTranslations = ReturnType<
  typeof useTranslations<"projectDomainOverview.workspace.ui">
>;

export function fetchedRowsSummary(
  fetched: number,
  total: number | null,
  rowsLabel: "keywords" | "pages",
  t: DomainOverviewTranslations,
) {
  if (total == null) {
    return t("fetchedRows", { fetched, rows: rowsLabel, total: "unknown" });
  }
  const remaining = Math.max(0, total - fetched);
  const requests = Math.ceil(remaining / 100);
  return t("fetchedRows", {
    fetched,
    remaining,
    requests,
    rows: rowsLabel,
    total: "known",
    totalValue: total,
  });
}

export function sortFetchedRows<T>(
  rows: readonly T[],
  value: (row: T) => SortValue,
  direction: SortDirection,
  locale = "en",
) {
  const collator = new Intl.Collator(locale, { numeric: true, sensitivity: "base" });
  return rows
    .map((row, index) => ({ index, row, value: value(row) }))
    .sort((left, right) => {
      if (left.value == null) return right.value == null ? left.index - right.index : 1;
      if (right.value == null) return -1;
      const compared =
        typeof left.value === "number" && typeof right.value === "number"
          ? left.value - right.value
          : collator.compare(String(left.value), String(right.value));
      return compared === 0 ? left.index - right.index : direction === "asc" ? compared : -compared;
    })
    .map(({ row }) => row);
}

export function SortableColumnHeader({
  active,
  align = "left",
  children,
  direction,
  nextDirection,
  onClick,
  t,
}: Readonly<{
  active: boolean;
  align?: "left" | "right";
  children: ReactNode;
  direction: SortDirection;
  nextDirection: SortDirection;
  onClick: () => void;
  t: DomainOverviewTranslations;
}>) {
  const Icon = direction === "asc" ? CaretUp : CaretDown;
  return (
    <span className={align === "right" ? "block w-full text-right" : "block w-full"}>
      <button
        aria-label={t("sort", {
          column: String(children),
          direction: t(
            active
              ? direction === "asc"
                ? "sortDescending"
                : "sortAscending"
              : nextDirection === "asc"
                ? "sortAscending"
                : "sortDescending",
          ),
        })}
        aria-pressed={active}
        className={`inline-flex w-full items-center gap-2 whitespace-nowrap font-sans tabular-nums text-[10px] font-medium uppercase tracking-[0.08em] transition-colors hover:text-fg ${
          align === "right" ? "justify-end text-right" : "text-left"
        } ${active ? "text-accent-text" : "text-fg-muted"}`}
        onClick={onClick}
        type="button"
      >
        {children}
        {active ? <Icon aria-hidden size={9} weight="regular" /> : null}
      </button>
    </span>
  );
}
