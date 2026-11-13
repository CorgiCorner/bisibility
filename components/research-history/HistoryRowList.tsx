"use client";

import { IconButton } from "@/components/ui/IconButton";
import { Tooltip } from "@/components/ui/Tooltip";
import { formatPaymentAmount } from "@/lib/action-payment/format";
import type { HistoryDayGroup, HistoryRow } from "@/lib/research-history/contract";
import { PushPinIcon as PushPin } from "@phosphor-icons/react/dist/csr/PushPin";
import { useLocale, useTranslations } from "next-intl";
import type { KeyboardEvent, ReactNode } from "react";
import "./HistoryRowList.module.css";

function HistoryWhen({ iso, timeZone }: Readonly<{ iso: string; timeZone: string }>) {
  const locale = useLocale();
  let label = iso.slice(11, 16);
  try {
    label = new Intl.DateTimeFormat(locale, { timeStyle: "short", timeZone }).format(new Date(iso));
  } catch {
    label = new Intl.DateTimeFormat(locale, { timeStyle: "short", timeZone: "UTC" }).format(
      new Date(iso),
    );
  }
  return (
    <time
      className="text-right text-ui-caption text-fg-muted tabular-nums"
      data-history-time=""
      dateTime={iso}
    >
      {label}
    </time>
  );
}

function HistoryCostText({ cost }: Readonly<{ cost: HistoryRow["cost"] }>) {
  const locale = useLocale();
  const t = useTranslations("researchHistory");
  if (cost.kind === "cached") return <span>{t("cached")}</span>;
  if (cost.kind === "unknown") return <span>-</span>;
  return <span>{formatPaymentAmount(cost.amount, locale)}</span>;
}

function dayLabel(
  group: HistoryDayGroup,
  locale: string,
  t: (key: "today" | "yesterday") => string,
) {
  if (group.label === "today") return t("today");
  if (group.label === "yesterday") return t("yesterday");
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: "UTC" }).format(
    new Date(`${group.day}T12:00:00Z`),
  );
}

export function HistoryRowList({
  groups,
  onOpen,
  onTogglePin,
  pinned,
  renderMeta,
  timeZone,
}: Readonly<{
  groups: readonly HistoryDayGroup[];
  onOpen: (row: HistoryRow) => void;
  onTogglePin: (row: HistoryRow) => void;
  pinned: (row: HistoryRow) => boolean;
  renderMeta: (row: HistoryRow) => ReactNode;
  timeZone: string;
}>) {
  const locale = useLocale();
  const t = useTranslations("researchHistory");
  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    const list = event.currentTarget.closest("[data-history-list]");
    const buttons = [...(list?.querySelectorAll<HTMLButtonElement>("[data-history-row]") ?? [])];
    const index = buttons.indexOf(event.currentTarget);
    const delta = event.key === "ArrowDown" ? 1 : -1;
    const next = buttons[index + delta] ?? buttons[delta > 0 ? 0 : buttons.length - 1];
    event.preventDefault();
    next?.focus();
  }
  return (
    <div className="grid gap-4" data-history-list="">
      {groups.map((group) => (
        <section className="grid gap-1" key={group.day}>
          <h3 className="m-0 pt-2.5 text-ui-micro uppercase tracking-wider text-fg-muted">
            {dayLabel(group, locale, t)}
          </h3>
          <ul className="m-0 grid list-none p-0">
            {group.rows.map((row) => {
              const isPinned = pinned(row);
              return (
                <li
                  className="-mx-2 grid min-w-0 items-center rounded-control px-2 py-2 hover:bg-bg-sunken focus-within:bg-bg-sunken"
                  data-history-grid=""
                  key={row.key}
                >
                  <button
                    className="min-w-0 rounded-control text-left outline-none focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-accent-solid"
                    data-history-row=""
                    onClick={() => void onOpen(row)}
                    onKeyDown={onKeyDown}
                    type="button"
                  >
                    <Tooltip content={row.title} wrapperClassName="block min-w-0">
                      <span className="block min-w-0 truncate text-ui-body text-fg">
                        {row.title}
                      </span>
                    </Tooltip>
                    <HistoryWhen iso={row.occurredAt} timeZone={timeZone} />
                    <span
                      className="min-w-0 truncate text-ui-caption text-fg-muted"
                      data-history-meta=""
                    >
                      {renderMeta(row)}
                    </span>
                    <span
                      className="text-right text-ui-caption text-fg-muted tabular-nums"
                      data-history-cost=""
                    >
                      <HistoryCostText cost={row.cost} />
                    </span>
                  </button>
                  <IconButton
                    aria-label={t(isPinned ? "unpin" : "pin", { title: row.title })}
                    aria-pressed={isPinned}
                    className="size-8 shrink-0 text-fg-muted"
                    data-history-pin=""
                    onClick={() => onTogglePin(row)}
                    size="small"
                    type="button"
                  >
                    <PushPin aria-hidden size={16} weight="regular" />
                  </IconButton>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
