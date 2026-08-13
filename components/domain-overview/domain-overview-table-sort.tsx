import { CaretDownIcon as CaretDown, CaretUpIcon as CaretUp } from "@phosphor-icons/react";
import type { ReactNode } from "react";

export type SortDirection = "asc" | "desc";

type SortValue = number | string | null;

const collator = new Intl.Collator("en-US", { numeric: true, sensitivity: "base" });
const number = new Intl.NumberFormat("en-US");

export function fetchedRowsSummary(
  fetched: number,
  total: number | null,
  rowsLabel: "keywords" | "pages",
) {
  if (total == null) {
    return `${number.format(fetched)} fetched ${rowsLabel} · total unavailable · remaining unknown · provider requests remaining unknown`;
  }
  const remaining = Math.max(0, total - fetched);
  const requests = Math.ceil(remaining / 100);
  return `${number.format(fetched)} fetched ${rowsLabel} · ${number.format(total)} total · ${number.format(remaining)} remaining · ${number.format(requests)} provider ${requests === 1 ? "request" : "requests"} remaining at up to 100 rows`;
}

export function sortFetchedRows<T>(
  rows: readonly T[],
  value: (row: T) => SortValue,
  direction: SortDirection,
) {
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
}: Readonly<{
  active: boolean;
  align?: "left" | "right";
  children: ReactNode;
  direction: SortDirection;
  nextDirection: SortDirection;
  onClick: () => void;
}>) {
  const Icon = direction === "asc" ? CaretUp : CaretDown;
  return (
    <span className={align === "right" ? "block w-full text-right" : "block w-full"}>
      <button
        aria-label={`Sort ${String(children)} ${active ? (direction === "asc" ? "descending" : "ascending") : nextDirection === "asc" ? "ascending" : "descending"}`}
        aria-pressed={active}
        className={`inline-flex w-full items-center gap-1 whitespace-nowrap font-mono text-[10px] font-medium uppercase tracking-[0.08em] transition-colors hover:text-fg ${
          align === "right" ? "justify-end text-right" : "text-left"
        } ${active ? "text-accent-text" : "text-fg-muted"}`}
        onClick={onClick}
        type="button"
      >
        {children}
        {active ? <Icon aria-hidden size={9} weight="bold" /> : null}
      </button>
    </span>
  );
}
