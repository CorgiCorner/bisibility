"use client";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { DataTable } from "@/components/ui/data-table/DataTable";
import type { DataTableColumn } from "@/components/ui/data-table/data-table-types";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { StatusChip, type StatusChipTone } from "@/components/ui/StatusChip";
import { metricBand } from "@/lib/pagespeed/thresholds";
import type {
  CoreWebVitalsCardModel,
  CoreWebVitalsRow,
  PageVitalsActionResult,
  PageVitalsStatus,
  PageVitalsStrategy,
} from "@/lib/pagespeed/view";
import { appPath } from "@/lib/routing/app-path";
import { useRouter } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { useState } from "react";

const TONE = {
  good: "positive",
  needs_improvement: "attention",
  poor: "critical",
  unknown: "neutral",
} as const satisfies Record<PageVitalsStatus, StatusChipTone>;

type VitalsTableRow = CoreWebVitalsRow & { id: string };

function MetricValue({
  band,
  source,
  value,
}: Readonly<{ band: PageVitalsStatus | null; source: string | null; value: string | null }>) {
  const t = useTranslations("projectSiteAudit");
  if (!value || !band) return <span className="text-fg-muted">-</span>;
  return (
    <span className="flex flex-col items-start gap-1">
      <span className="flex flex-wrap items-center gap-1">
        <span>{value}</span>
        <StatusChip label={t(`vitals.status.${band}`)} size="sm" tone={TONE[band]} />
      </span>
      {source ? <span className="text-ui-caption text-fg-muted">{source}</span> : null}
    </span>
  );
}

export function CoreWebVitalsCard({
  canCheck,
  checkAction,
  model,
  projectId,
}: Readonly<{
  canCheck: boolean;
  checkAction: (input: { projectId: string }) => Promise<PageVitalsActionResult>;
  model: CoreWebVitalsCardModel;
  projectId: string;
}>) {
  const t = useTranslations("projectSiteAudit");
  const format = useFormatter();
  const router = useRouter();
  const [strategy, setStrategy] = useState<PageVitalsStrategy>("mobile");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const view = model[strategy];
  const checked = view.rows.some((row) => row.status != null);
  const sourceLabel = (row: CoreWebVitalsRow) =>
    row.source ? t(`vitals.source.${row.source}`) : null;
  const seconds = (value: number) =>
    t("vitals.seconds", {
      value: format.number(value / 1000, { maximumFractionDigits: 1, minimumFractionDigits: 1 }),
    });
  const milliseconds = (value: number) => t("vitals.milliseconds", { value: format.number(value) });

  const columns: readonly DataTableColumn<VitalsTableRow>[] = [
    {
      cell: ({ row }) => row.original.path,
      header: t("vitals.columns.page"),
      id: "path",
      meta: { flex: 1, title: t("vitals.columns.page") },
      minSize: 140,
    },
    {
      cell: ({ row }) => (
        <MetricValue
          band={row.original.lcpMs == null ? null : metricBand("lcp", row.original.lcpMs)}
          source={sourceLabel(row.original)}
          value={row.original.lcpMs == null ? null : seconds(row.original.lcpMs)}
        />
      ),
      header: t("vitals.columns.lcp"),
      id: "lcp",
      meta: { title: t("vitals.columns.lcp") },
      minSize: 160,
    },
    {
      cell: ({ row }) => (
        <MetricValue
          band={row.original.inpMs == null ? null : metricBand("inp", row.original.inpMs)}
          source={sourceLabel(row.original)}
          value={row.original.inpMs == null ? null : milliseconds(row.original.inpMs)}
        />
      ),
      header: t("vitals.columns.inp"),
      id: "inp",
      meta: { title: t("vitals.columns.inp") },
      minSize: 160,
    },
    {
      cell: ({ row }) => (
        <MetricValue
          band={row.original.cls == null ? null : metricBand("cls", row.original.cls)}
          source={sourceLabel(row.original)}
          value={
            row.original.cls == null
              ? null
              : format.number(row.original.cls, {
                  maximumFractionDigits: 2,
                  minimumFractionDigits: 2,
                })
          }
        />
      ),
      header: t("vitals.columns.cls"),
      id: "cls",
      meta: { title: t("vitals.columns.cls") },
      minSize: 140,
    },
    {
      cell: ({ row }) =>
        row.original.status ? (
          <StatusChip
            label={t(`vitals.status.${row.original.status}`)}
            size="sm"
            tone={TONE[row.original.status]}
          />
        ) : (
          <span className="text-fg-muted">-</span>
        ),
      header: t("vitals.columns.status"),
      id: "status",
      meta: { title: t("vitals.columns.status") },
      minSize: 140,
    },
  ];

  async function check() {
    if (!canCheck || busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await checkAction({ projectId });
      if (!result.ok) {
        setError(t(`vitals.error.${result.code}`));
        return;
      }
      router.refresh();
    } catch {
      setError(t("vitals.error.invalid_key"));
    } finally {
      setBusy(false);
    }
  }

  const rows: VitalsTableRow[] = view.rows.map((row) => ({ ...row, id: row.path }));

  return (
    <Card>
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SectionTitle className="m-0">{t("vitals.title")}</SectionTitle>
          {model.connected ? (
            <SegmentedControl
              ariaLabel={t("vitals.strategy")}
              onChange={setStrategy}
              options={[
                { label: t("vitals.mobile"), value: "mobile" },
                { label: t("vitals.desktop"), value: "desktop" },
              ]}
              size="toolbar"
              value={strategy}
            />
          ) : null}
        </div>
        {model.connected ? (
          <>
            <p className="m-0 text-ui-caption text-fg-muted">{t("vitals.goodHint")}</p>
            {checked ? (
              <p className="m-0 text-ui-body text-fg">
                {t("vitals.passCount", {
                  pass: view.passCount,
                  sample: view.rows.length,
                  strategy: t(`vitals.${strategy}`),
                })}
              </p>
            ) : (
              <p className="m-0 text-ui-body text-fg-muted">
                {view.rows.length === 0 ? t("vitals.noSample") : t("vitals.notChecked")}
              </p>
            )}
            {rows.length > 0 ? (
              <DataTable
                ariaLabel={t("vitals.title")}
                columns={columns}
                density="compact"
                id="core-web-vitals"
                onSortingChange={() => undefined}
                rows={rows}
                sorting={null}
              />
            ) : null}
            {error ? <p className="m-0 text-ui-caption text-danger">{error}</p> : null}
            <div>
              <Button
                disabled={!canCheck || busy || view.rows.length === 0}
                loading={busy}
                onClick={() => void check()}
                size="sm"
                type="button"
              >
                {t("vitals.check")}
              </Button>
            </div>
          </>
        ) : (
          <div className="flex flex-col items-start gap-3">
            <p className="m-0 text-ui-body text-fg">{t("vitals.connectBody")}</p>
            <Button
              href={`${appPath(projectId, "providers")}?connect=pagespeed`}
              size="sm"
              variant="secondary"
            >
              {t("vitals.connect")}
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
}
