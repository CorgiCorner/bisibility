"use client";

import { IconButton } from "@/components/ui/IconButton";
import { Tooltip } from "@/components/ui/Tooltip";
import { InfoIcon } from "@phosphor-icons/react/dist/csr/Info";
import type { Figure, Limit } from "@usagekit/views";
import Link from "next/link";
import { isZeroFigure } from "./usage-number-format";
import { useUsagePresentation } from "./use-usage-presentation";

export type BudgetValueKind = "used" | "reserved" | "remaining" | "limit";
export function BudgetHeading({ kind }: { kind: BudgetValueKind }) {
  const p = useUsagePresentation();
  const label = p.budget[kind];
  return kind === "reserved" ? (
    <span className="inline-flex items-center gap-1">
      {label}
      <Tooltip content={p.budget.reservedHint} semantics="description">
        <IconButton
          size="small"
          aria-label={p.budget.reservedInfo}
          className="size-4 min-h-4 p-0 text-fg-muted"
        >
          <InfoIcon weight="regular" aria-hidden size={12} />
        </IconButton>
      </Tooltip>
    </span>
  ) : (
    label
  );
}

export function BudgetValue({
  value,
  kind,
  onEdit,
  href,
  monthly = false,
  level,
  unitLabel,
}: {
  value: Figure | Limit;
  kind: BudgetValueKind;
  onEdit?: () => void;
  href?: string;
  monthly?: boolean;
  /** Native provider wording supplied by the host without changing the accounting unit. */
  unitLabel?: string;
  level?: "ok" | "warning" | "exceeded" | "unavailable";
}) {
  const p = useUsagePresentation();
  const unlimited = value === "unlimited";
  const zero = isZeroFigure(value);
  const over =
    kind === "remaining" && typeof value !== "string" && value.text.startsWith("-") && !zero;
  const number =
    typeof value !== "string"
      ? p.budgetFigure(over ? { ...value, text: value.text.slice(1) } : value)
      : null;
  const missing =
    value === "unavailable" ||
    (typeof value !== "string" && (value.certainty === "unknown" || number === null));
  const unit = typeof value !== "string" ? (unitLabel ?? p.unit(value.unit)) : "";
  const formatted = [number, unit].filter(Boolean).join(" ");
  const text =
    missing || (unlimited && kind !== "limit") || (zero && kind === "reserved")
      ? "—"
      : unlimited
        ? p.budget.noLimit
        : over
          ? p.budget.overBy.replace("{amount}", formatted)
          : formatted;
  const editable = kind === "limit" && !missing && (onEdit || href);
  const label = unlimited && editable ? p.budget.setLimit : text;
  const content = (
    <>
      {label}
      {kind === "limit" && monthly && !unlimited && !missing ? (
        <>
          {" "}
          <span className="text-xs font-normal text-fg-muted">{p.budget.perMonth}</span>
        </>
      ) : null}
    </>
  );
  return (
    <span
      className={`whitespace-nowrap tabular-nums ${missing || unlimited ? "text-fg-muted" : over || (kind === "remaining" && level === "exceeded") ? "text-red-text" : kind === "remaining" && level === "warning" ? "text-yellow-text" : zero ? "text-fg-muted" : ""}`}
      aria-label={
        missing
          ? value === "unavailable"
            ? p.budget.unavailable
            : p.budget.unknown
          : typeof value !== "string" && value.certainty === "estimated" && !zero
            ? `${p.measurement.estimated}: ${formatted}`
            : undefined
      }
      title={
        missing ? (value === "unavailable" ? p.budget.unavailable : p.budget.unknown) : undefined
      }
    >
      {editable ? (
        href ? (
          <Link
            href={href}
            className={`${unlimited ? "text-xs font-normal" : ""} p-0 text-accent underline underline-offset-2`}
          >
            {content}
          </Link>
        ) : (
          <button
            type="button"
            onClick={onEdit}
            className={`${unlimited ? "text-xs font-normal" : ""} cursor-pointer p-0 text-accent underline underline-offset-2`}
          >
            {content}
          </button>
        )
      ) : (
        content
      )}
    </span>
  );
}
