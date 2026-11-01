"use client";

import { useUsagePresentation } from "@/components/metering/use-usage-presentation";
import { Button } from "@/components/ui/Button";
import { InfoTooltip } from "@/components/ui/InfoTooltip";
import { UsageMeter } from "@/components/usagekit/usage-meter";
import type { ProjectBudgetRow } from "@/lib/metering/project-budget-display";
import {
  knownFigure,
  overviewPercent,
  type UsageLimitEntry,
} from "@/lib/metering/usage-limit-view";
import type { UsageConnection } from "@/lib/metering/user-views";
import { BrowserIcon } from "@phosphor-icons/react/dist/csr/Browser";
import { PencilSimpleIcon } from "@phosphor-icons/react/dist/csr/PencilSimple";
import { TerminalWindowIcon } from "@phosphor-icons/react/dist/csr/TerminalWindow";
import type { Figure, ProviderAllocationRow } from "@usagekit/views";
import { useLocale, useTranslations } from "next-intl";
import type { ReactNode } from "react";

export type LimitSurface = ProviderAllocationRow["surface"];
export type EditProviderLimit = (connection: UsageConnection, surface: LimitSurface) => void;

function rowSurface(row: ProjectBudgetRow): LimitSurface | null {
  return row.traffic.kind === "surface" ? row.traffic.surface : null;
}

/** Display text for one monthly limit reading, shared by project and provider limits. */
export function useLimitText() {
  const t = useTranslations("projectSettingsUsage.limits");
  const p = useUsagePresentation();
  const locale = useLocale();
  const amount = (
    value: Figure | "unlimited",
    unit: (unit: string, count?: string) => string = p.unit,
  ) => {
    const figure = knownFigure(value);
    if (!figure) return t("unknown");
    return [p.budgetFigure(figure) ?? t("unknown"), unit(figure.unit, figure.text)]
      .filter(Boolean)
      .join(" ");
  };
  const capped = (row: ProjectBudgetRow) => knownFigure(row.limit) !== null;
  // Proved own usage whose amount is still partly an admission estimate, never a lower bound.
  const estimated = (row: ProjectBudgetRow) => knownFigure(row.used)?.certainty === "estimated";
  return {
    t,
    amount,
    capped,
    estimated,
    headline: (row: ProjectBudgetRow, unit?: (unit: string, count?: string) => string) =>
      capped(row)
        ? t(estimated(row) ? "usedOfEstimated" : "usedOf", {
            used: amount(row.used, () => ""),
            limit: amount(row.limit, unit),
          })
        : t(estimated(row) ? "usedEstimated" : "used", { used: amount(row.used, unit) }),
    status: (row: ProjectBudgetRow, unit?: (unit: string, count?: string) => string) => {
      const state =
        row.limit === "unlimited"
          ? t("noLimit")
          : row.level === "unavailable"
            ? t("partial")
            : row.level === "exceeded"
              ? t("limitReached")
              : capped(row)
                ? [
                    row.level === "warning" ? t("nearLimit") : null,
                    t("left", { amount: amount(row.remaining, unit) }),
                  ]
                    .filter(Boolean)
                    .join(" · ")
                : t("unknown");
      const reset = row.resetsAt
        ? t("resets", {
            date: new Intl.DateTimeFormat(locale, {
              month: "short",
              day: "numeric",
              timeZone: "UTC",
            }).format(new Date(row.resetsAt)),
          })
        : null;
      return [state, reset].filter(Boolean).join(" · ");
    },
  };
}

export function SurfaceLabel({ surface }: { surface: LimitSurface }) {
  const t = useTranslations("projectSettingsUsage.limits");
  const p = useUsagePresentation();
  const Icon = surface === "app" ? BrowserIcon : TerminalWindowIcon;
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5 text-xs font-medium text-fg-muted">
      <Icon aria-hidden size={14} weight="regular" className="shrink-0" />
      <span className="min-w-0 break-words">{p.operation(surface)}</span>
      <InfoTooltip text={surface === "app" ? t("appHelp") : t("apiHelp")} />
    </span>
  );
}

function LimitRow({
  entry,
  row,
  onEdit,
}: {
  entry: UsageLimitEntry;
  row: ProjectBudgetRow;
  onEdit?: EditProviderLimit;
}) {
  const text = useLimitText();
  const p = useUsagePresentation();
  const surface = rowSurface(row);
  const unit = (value: string, count?: string) =>
    p.providerUnit(value, entry.connection.provider, count);
  const partial = row.level === "unavailable";
  const percent = partial ? null : overviewPercent(row);
  const label = surface ? p.operation(surface) : p.operation("any");
  const unset = row.limit === "unlimited";
  return (
    <li
      className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1.5 px-3 py-2.5 sm:grid-cols-[170px_minmax(0,1fr)_auto]"
      data-limit-row={row.id}
      data-limit-estimated={text.estimated(row) || undefined}
    >
      {surface ? <SurfaceLabel surface={surface} /> : <span className="text-xs">{label}</span>}
      <div className="col-span-2 min-w-0 space-y-1 sm:col-span-1 sm:col-start-2 sm:row-start-1">
        <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-3">
          <span className="break-words text-sm font-medium tabular-nums">
            {text.headline(row, unit)}
          </span>
          <span
            className={`text-xs ${row.level === "exceeded" ? "text-red-text" : "text-fg-muted"}`}
          >
            {text.status(row, unit)}
          </span>
        </div>
        {text.capped(row) && percent !== null && (
          <UsageMeter
            percent={percent}
            level={row.level === "unavailable" ? undefined : row.level}
            label={`${entry.label}: ${label}`}
            valueText={text.headline(row, unit)}
            size="sm"
            className={text.estimated(row) ? "opacity-50" : undefined}
          />
        )}
      </div>
      {onEdit && surface && (
        <div className="col-start-2 row-start-1 justify-self-end sm:col-start-3">
          <Button
            size="xs"
            variant="ghost"
            className={unset ? undefined : "min-w-0 px-1.5"}
            aria-label={text.t(unset ? "setLimitFor" : "editLimitFor", {
              surface: label,
              provider: entry.label,
            })}
            onClick={() => onEdit(entry.connection, surface)}
          >
            {unset ? (
              text.t("setLimit")
            ) : (
              <PencilSimpleIcon aria-hidden size={14} weight="regular" />
            )}
          </Button>
        </div>
      )}
    </li>
  );
}

/** One provider: its name, funding tag and one row per traffic limit. */
export function ProviderLimitGroup({
  entry,
  onEdit,
  children,
}: {
  entry: UsageLimitEntry;
  onEdit?: EditProviderLimit;
  /** Host details under the limits, such as the provider's own balance. */
  children?: ReactNode;
}) {
  const t = useTranslations("projectSettingsUsage.limits");
  return (
    <section
      aria-label={entry.label}
      className="min-w-0 space-y-2"
      data-provider-limits={entry.connection.connectionId}
    >
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <h3 className="min-w-0 break-words text-sm font-semibold">{entry.label}</h3>
        <span className="rounded-full bg-bg-band px-2 py-0.5 text-[11px] text-fg-muted">
          {entry.connection.credentialSource === "hosted" ? t("creditsTag") : t("ownKeyTag")}
        </span>
      </div>
      <ul className="m-0 min-w-0 list-none divide-y divide-border rounded-control border border-border p-0">
        {entry.rows.map((row) => (
          <LimitRow key={row.id} entry={entry} row={row} onEdit={onEdit} />
        ))}
      </ul>
      {children}
    </section>
  );
}
