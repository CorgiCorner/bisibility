"use client";
import { useUsagePresentation } from "@/components/metering/use-usage-presentation";
import { Button } from "@/components/ui/Button";
import { IdChip } from "@/components/ui/IdChip";
import { InfoTooltip } from "@/components/ui/InfoTooltip";
import { ExceptionsList } from "@/components/usagekit/exceptions-list";
import { UsageTable } from "@/components/usagekit/usage-table";
import { loadMeteringAdminPageAction } from "@/lib/actions/metering-admin";
import type { MeteringAdminData } from "@/lib/metering/admin-types";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { AdminBudgetTable } from "./AdminBudgetTable";
export function AdminMeteringView({
  data,
  month,
  project,
}: {
  data: MeteringAdminData | null;
  month?: string;
  project?: string | null;
}) {
  const t = useTranslations("instanceAdmin.metering");
  const p = useUsagePresentation();
  const common = useTranslations("shared.emergencyRecovery.error");
  const [failedPage, setFailedPage] = useState<{
    input: typeof data;
    kind: "usage" | "exceptions";
    cursor?: string;
  } | null>(null);
  const [loaded, setLoaded] = useState<{ input: typeof data; value: typeof data } | null>(null);
  const [position, setPosition] = useState<{
    input: typeof data;
    usageCursor?: string;
    exceptionCursor?: string;
  }>({ input: data });
  const [busy, startTransition] = useTransition();
  const current = loaded?.input === data ? loaded.value : data;
  function page(kind: "usage" | "exceptions", cursor?: string) {
    if (!month || busy) return;
    const previous = position.input === data ? position : { input: data };
    const cursors = {
      usageCursor: kind === "usage" ? cursor : previous.usageCursor,
      exceptionCursor: kind === "exceptions" ? cursor : previous.exceptionCursor,
    };
    startTransition(async () => {
      try {
        const next = await loadMeteringAdminPageAction({
          month,
          project: project ?? undefined,
          ...cursors,
        });
        setPosition({ input: data, ...cursors });
        setLoaded({ input: data, value: next.data });
        setFailedPage(next.data ? null : { input: data, kind, cursor });
      } catch {
        setFailedPage({ input: data, kind, cursor });
        setLoaded({ input: data, value: null });
      }
    });
  }
  if (!current)
    return (
      <div className="space-y-3">
        <p role="status" className="rounded-2xl border border-border p-6 text-sm text-fg-muted">
          {t("unavailableNote")}
        </p>
        {month && (
          <Button
            disabled={busy}
            onClick={() => {
              const retry = failedPage?.input === data ? failedPage : null;
              page(retry?.kind ?? "usage", retry?.cursor);
            }}
          >
            {common("retry")}
          </Button>
        )}
      </div>
    );
  return (
    <div className="grid min-w-0 grid-cols-1 gap-6">
      {current.truncated && <p role="status">{t("truncated")}</p>}
      <section aria-labelledby="admin-usage-heading" className="grid min-w-0 grid-cols-1 gap-3">
        <h2 id="admin-usage-heading" className="text-sm font-semibold">
          {t("usageHeading")}
        </h2>
        <UsageTable
          view={{
            ...current.usage,
            groupBy: ["connection", "source"],
            units: current.usage.units.filter((unit) => unit !== "cents"),
          }}
          labels={p.table}
          dimensionLabels={p.dimensions}
          formatDimension={(key, value, row) =>
            key === "connection" ? (
              <div className="grid gap-1">
                <span className="max-w-52 whitespace-normal break-words font-medium">
                  {current.references?.connections[value]?.project ?? row.dimensions.provider}
                </span>
                <div className="flex items-center gap-2 text-xs text-fg-muted">
                  {current.references?.connections[value] && <span>{row.dimensions.provider}</span>}
                  {value && <IdChip value={value} truncate="middle" size="xs" />}
                </div>
              </div>
            ) : (
              <div className="grid gap-1">
                <span>{p.dimension("surface", row.dimensions.surface ?? "")}</span>
                <code className="text-xs text-fg-muted">{value}</code>
              </div>
            )
          }
          formatFigure={p.figure}
          formatUnit={p.unit}
          showFunding
          busy={busy}
          onNextPage={(cursor) => page("usage", cursor)}
          onFirstPage={
            position.input === data && position.usageCursor ? () => page("usage") : undefined
          }
          unitLabels={{ cents: p.table.cost, customer_cents: p.table.customerCharges }}
          metadata={
            current.usage.asOf && (
              <p className="text-xs text-fg-muted tabular-nums">
                {p.summary.asOf}: {p.date(current.usage.asOf)}
              </p>
            )
          }
        />
      </section>
      <section aria-labelledby="admin-budget-heading" className="grid min-w-0 grid-cols-1 gap-3">
        <div className="flex items-center gap-1">
          <h2 id="admin-budget-heading" className="text-sm font-semibold">
            {t("budgetsHeading")}
          </h2>
          <InfoTooltip text={t("budgetNote")} />
        </div>
        <AdminBudgetTable busy={busy} rows={current.budgets} references={current.references} />
      </section>
      <section
        aria-labelledby="admin-exceptions-heading"
        className="grid min-w-0 grid-cols-1 gap-3"
      >
        <h2 id="admin-exceptions-heading" className="text-sm font-semibold">
          {p.exceptions.title}
        </h2>
        <ExceptionsList
          view={current.exceptions}
          labels={p.exceptions}
          formatState={p.state}
          formatAge={p.age}
          formatOperation={p.operation}
          formatOperationId={(value) => <IdChip value={value} truncate="middle" size="xs" />}
          busy={busy}
          onNextPage={(cursor) => page("exceptions", cursor)}
          onFirstPage={
            position.input === data && position.exceptionCursor
              ? () => page("exceptions")
              : undefined
          }
        />
      </section>
    </div>
  );
}
