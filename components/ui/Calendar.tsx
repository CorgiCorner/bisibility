"use client";

import { useDateDisplay } from "@/components/dates/DateFormatProvider";
import { formatDayOfMonth, formatDisplayDate } from "@/lib/dates/format";
import { cn } from "@/lib/ui/cn";
import { CaretLeftIcon as CaretLeft } from "@phosphor-icons/react/dist/csr/CaretLeft";
import { CaretRightIcon as CaretRight } from "@phosphor-icons/react/dist/csr/CaretRight";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";

export type CalendarProps = {
  ariaLabel?: string;
  className?: string;
  /** Latest selectable day, inclusive (YYYY-MM-DD). */
  max?: string;
  /** Earliest selectable day, inclusive (YYYY-MM-DD). */
  min?: string;
  onChange: (date: string) => void;
  /** Selected day (YYYY-MM-DD). */
  value?: string;
};

type ViewMonth = { month: number; year: number };

function parseISO(iso: string) {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function isoOf(date: Date) {
  return date.toISOString().slice(0, 10);
}

function addDays(iso: string, days: number) {
  const date = parseISO(iso);
  date.setUTCDate(date.getUTCDate() + days);
  return isoOf(date);
}

function monthOf(iso: string): ViewMonth {
  const date = parseISO(iso);
  return { month: date.getUTCMonth() + 1, year: date.getUTCFullYear() };
}

function todayISO() {
  return isoOf(new Date());
}

const KEY_DELTAS: Record<string, number> = {
  ArrowDown: 7,
  ArrowLeft: -1,
  ArrowRight: 1,
  ArrowUp: -7,
};

export function Calendar({
  ariaLabel,
  className,
  max,
  min,
  onChange,
  value,
}: Readonly<CalendarProps>) {
  const t = useTranslations("shared.controls.calendar");
  const weekdayLabels = [
    t("sunday"),
    t("monday"),
    t("tuesday"),
    t("wednesday"),
    t("thursday"),
    t("friday"),
    t("saturday"),
  ];
  const monthLabels = [
    t("january"),
    t("february"),
    t("march"),
    t("april"),
    t("may"),
    t("june"),
    t("july"),
    t("august"),
    t("september"),
    t("october"),
    t("november"),
    t("december"),
  ];
  const dateDisplay = useDateDisplay();
  const base = value ?? max ?? todayISO();
  const [view, setView] = useState<ViewMonth>(() => monthOf(base));
  const [focused, setFocused] = useState(base);
  const dayRefs = useRef(new Map<string, HTMLButtonElement>());
  const pendingFocus = useRef<string | null>(null);

  function clamp(iso: string) {
    if (max && iso > max) return max;
    if (min && iso < min) return min;
    return iso;
  }

  function isDisabled(iso: string) {
    return (max !== undefined && iso > max) || (min !== undefined && iso < min);
  }

  function registerDay(iso: string) {
    return (node: HTMLButtonElement | null) => {
      if (node) {
        dayRefs.current.set(iso, node);
        if (pendingFocus.current === iso) {
          pendingFocus.current = null;
          node.focus();
        }
      } else {
        dayRefs.current.delete(iso);
      }
    };
  }

  function moveFocus(nextISO: string) {
    const target = clamp(nextISO);
    setFocused(target);
    const existing = dayRefs.current.get(target);
    if (existing) {
      existing.focus();
    } else {
      pendingFocus.current = target;
      setView(monthOf(target));
    }
  }

  function select(iso: string) {
    if (isDisabled(iso)) return;
    setFocused(iso);
    setView(monthOf(iso));
    onChange(iso);
  }

  function changeMonth(delta: number) {
    const anchor = new Date(Date.UTC(view.year, view.month - 1 + delta, 1));
    setView({ month: anchor.getUTCMonth() + 1, year: anchor.getUTCFullYear() });
  }

  function onGridKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    const delta = KEY_DELTAS[event.key];
    if (delta !== undefined) {
      event.preventDefault();
      moveFocus(addDays(focused, delta));
      return;
    }
    if (event.key === "PageUp" || event.key === "PageDown") {
      event.preventDefault();
      const anchor = new Date(
        Date.UTC(view.year, view.month - 1 + (event.key === "PageDown" ? 1 : -1), 1),
      );
      moveFocus(clamp(isoOf(anchor)));
    }
  }

  const firstOfMonth = new Date(Date.UTC(view.year, view.month - 1, 1));
  const gridStart = addDays(isoOf(firstOfMonth), -firstOfMonth.getUTCDay());
  const cells = Array.from({ length: 42 }, (_, index) => addDays(gridStart, index));
  const today = todayISO();
  const nextDisabled = max !== undefined && isoOf(firstOfMonth) > max;

  return (
    // biome-ignore lint/a11y/useSemanticElements: grouping wrapper for a date picker, not a fieldset form control
    <div
      aria-label={ariaLabel ?? t("chooseDate")}
      className={cn("w-full select-none", className)}
      role="group"
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <MonthNavButton
          disabled={min !== undefined && isoOf(firstOfMonth) <= min}
          label={t("previousMonth")}
          onClick={() => changeMonth(-1)}
        >
          <CaretLeft aria-hidden size={15} weight="regular" />
        </MonthNavButton>
        <span aria-live="polite" className="text-[13px] font-semibold text-fg">
          {t("monthYear", { month: monthLabels[view.month - 1], year: String(view.year) })}
        </span>
        <MonthNavButton
          disabled={nextDisabled}
          label={t("nextMonth")}
          onClick={() => changeMonth(1)}
        >
          <CaretRight aria-hidden size={15} weight="regular" />
        </MonthNavButton>
      </div>
      <div
        aria-hidden
        className="mb-1 grid grid-cols-7 gap-1 text-[10px] tabular-nums font-semibold uppercase tracking-[.04em] text-fg-muted"
      >
        {weekdayLabels.map((label) => (
          <span className="grid h-6 place-items-center" key={label}>
            {label}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((iso) => {
          const inMonth = monthOf(iso).month === view.month;
          const disabled = isDisabled(iso);
          const selected = value === iso;
          return (
            <button
              aria-current={iso === today ? "date" : undefined}
              aria-label={formatDisplayDate(iso, dateDisplay)}
              aria-pressed={selected}
              className={cn(
                "grid h-8 w-full place-items-center rounded-control text-[12.5px] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-solid",
                selected
                  ? "bg-accent-solid font-semibold text-accent-on-solid"
                  : "hover:bg-bg-sunken text-fg",
                !inMonth && !selected && "text-fg-muted",
                iso === today && !selected && "ring-1 ring-border-control",
                disabled && "pointer-events-none opacity-35",
              )}
              disabled={disabled}
              key={iso}
              onClick={() => select(iso)}
              onKeyDown={onGridKeyDown}
              ref={registerDay(iso)}
              tabIndex={iso === focused ? 0 : -1}
              type="button"
            >
              {formatDayOfMonth(iso, dateDisplay.dateFormat)}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function MonthNavButton({
  children,
  disabled,
  label,
  onClick,
}: Readonly<{
  children: React.ReactNode;
  disabled: boolean;
  label: string;
  onClick: () => void;
}>) {
  return (
    <button
      aria-label={label}
      className="grid h-7 w-7 place-items-center rounded-control border border-border-control bg-bg-elev text-fg-muted outline-none transition-colors hover:border-accent hover:text-fg focus-visible:border-accent disabled:pointer-events-none disabled:opacity-35"
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}
