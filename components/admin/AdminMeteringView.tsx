"use client";
import { useUsagePresentation } from "@/components/metering/use-usage-presentation";
import { Button } from "@/components/ui/Button";
import { BudgetCard } from "@/components/usagekit/budget-card";
import { ExceptionsList } from "@/components/usagekit/exceptions-list";
import { UsageTable } from "@/components/usagekit/usage-table";
import { loadMeteringAdminPageAction } from "@/lib/actions/metering-admin";
import type { MeteringAdminData } from "@/lib/metering/admin-types";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
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
    <div className="grid min-w-0 gap-5">
      {current.truncated && <p role="status">{t("truncated")}</p>}
      <UsageTable
        view={current.usage}
        labels={p.table}
        dimensionLabels={p.dimensions}
        formatDimension={p.dimension}
        formatFigure={p.figure}
        formatUnit={p.unit}
        showFunding
        busy={busy}
        onNextPage={(cursor) => page("usage", cursor)}
        onFirstPage={() => page("usage")}
        metadata={
          current.usage.asOf && (
            <p>
              {p.summary.asOf}: {p.date(current.usage.asOf)}
            </p>
          )
        }
      />
      <p className="text-xs text-fg-muted">{t("budgetNote")}</p>
      {current.budgets.length ? (
        current.budgets.map((row) => (
          <BudgetCard
            key={row.id}
            row={row}
            title={p.bound(row)}
            labels={p.budget}
            formatTime={p.date}
            formatFigure={p.figure}
            formatUnit={p.unit}
          />
        ))
      ) : (
        <p>{p.budget.empty}</p>
      )}
      <ExceptionsList
        view={current.exceptions}
        labels={p.exceptions}
        formatState={p.state}
        formatAge={p.age}
        formatOperation={p.operation}
        busy={busy}
        onNextPage={(cursor) => page("exceptions", cursor)}
        onFirstPage={() => page("exceptions")}
      />
    </div>
  );
}
