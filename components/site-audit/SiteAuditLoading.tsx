"use client";

import { PageContent } from "@/components/shell/PageContent";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { DataTable } from "@/components/ui/data-table/DataTable";
import type { DataTableColumn } from "@/components/ui/data-table/data-table-types";
import { EmptyState } from "@/components/ui/EmptyState";
import { FieldLabel } from "@/components/ui/FieldLabel";
import { Input } from "@/components/ui/Input";
import { MagnifyingGlassIcon } from "@phosphor-icons/react/dist/csr/MagnifyingGlass";
import { useTranslations } from "next-intl";
import { siteAuditTableLayout } from "./site-audit-table-layout";

export function SiteAuditPageLoading() {
  const t = useTranslations("projectSiteAudit");
  return (
    <PageContent>
      <section
        role="status"
        aria-label={t("loadingPage")}
        aria-busy="true"
        className="grid min-w-0 gap-4"
      >
        <div aria-hidden>
          <Card>
            <p className="m-0 text-[13px] text-fg-muted opacity-40 motion-safe:animate-pulse">
              {t("description", { domain: "…" })}
            </p>
            <div className="mt-4 flex flex-wrap items-end gap-3">
              <div className="grid w-32 gap-2">
                <FieldLabel className="text-ui-body font-medium" label={t("pageLimit")} />
                <Input
                  disabled
                  tabIndex={-1}
                  aria-hidden
                  className="bg-bg-sunken motion-safe:animate-pulse"
                />
              </div>
              <Button
                size="input"
                disabled
                tabIndex={-1}
                startIcon={<MagnifyingGlassIcon size={15} weight="regular" />}
                className="opacity-40 motion-safe:animate-pulse"
              >
                {t("run")}
              </Button>
              <p className="m-0 pb-2 text-[11px] text-fg-muted">{t("cost")}</p>
            </div>
          </Card>
        </div>
        <div aria-hidden className="opacity-40 motion-safe:animate-pulse">
          <EmptyState
            icon={<MagnifyingGlassIcon size={24} weight="regular" />}
            title={t("emptyTitle")}
            description={t("emptyDescription")}
            bullets={[t("bullets.0"), t("bullets.1"), t("bullets.2")]}
          />
        </div>
      </section>
    </PageContent>
  );
}

type PendingPage = { id: string };
const noopSort = () => undefined;
export function SiteAuditResultsLoading({
  label,
  rows = 3,
}: Readonly<{ label: string; rows?: number }>) {
  const t = useTranslations("projectSiteAudit");
  const labels = [t("columns.0"), t("columns.1"), t("columns.2"), t("columns.3"), t("columns.4")];
  const columns: DataTableColumn<PendingPage>[] = (
    ["url", "status", "indexable", "links", "issues"] as const
  ).map((key, index) => ({
    id: key,
    header: labels[index],
    ...siteAuditTableLayout[key],
    enableSorting: false,
    cell: () => (
      <div className="grid w-full max-w-60 gap-1.5 py-2" aria-hidden>
        <div className="h-3 w-3/4 rounded-sm bg-bg-sunken motion-safe:animate-pulse" />
        {key === "url" || key === "issues" ? (
          <div className="h-3 w-1/2 rounded-sm bg-bg-sunken motion-safe:animate-pulse" />
        ) : null}
      </div>
    ),
  }));
  return (
    <section aria-busy="true" aria-label={label} className="grid min-w-0 gap-4">
      <div
        aria-hidden
        className="h-4 w-60 max-w-full rounded-control bg-bg-sunken motion-safe:animate-pulse"
      />
      <div
        aria-hidden
        className="h-[37px] w-full rounded-control border border-border bg-bg-elev"
      />
      <Card className="overflow-hidden p-0">
        <div className="px-4 py-3 text-[14px] font-semibold">{t("urlIssues")}</div>
        <DataTable
          ariaLabel={label}
          bordered={false}
          columns={columns}
          density="comfortable"
          id="site-audit-results-loading"
          layout="auto"
          onSortingChange={noopSort}
          sorting={null}
          rows={Array.from({ length: Math.max(1, rows) }, (_, index) => ({ id: String(index) }))}
        />
      </Card>
    </section>
  );
}
