"use client";

import { AppDrawer } from "@/components/ui/AppDrawer";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { DataTable } from "@/components/ui/data-table/DataTable";
import type { DataTableColumn, DataTableSort } from "@/components/ui/data-table/data-table-types";
import { PillBadge } from "@/components/ui/Pill";
import { SummaryStrip } from "@/components/ui/SummaryStrip";
import { auditFailureReason } from "@/lib/site-audit/failure";
import { auditCoverage, hasAuditContent } from "@/lib/site-audit/presentation";
import type { SiteAuditIssue, SiteAuditPage, SiteAuditResult } from "@/lib/site-audit/schema";
import { useTranslations } from "next-intl";
import { useState } from "react";

const numericIssueKeys = {
  http_error: "issues.http_error",
  h1_count: "issues.h1_count",
  missing_image_alt: "issues.missing_image_alt",
  broken_internal_link: "issues.broken_internal_link",
} as const;
const plainIssueKeys = {
  missing_title: "issues.missing_title",
  missing_description: "issues.missing_description",
  noindex: "issues.noindex",
  non_html: "issues.non_html",
  robots_disallowed: "issues.robots_disallowed",
} as const;

type AuditRow = SiteAuditPage & { id: string };

export function SiteAuditResults({ result }: Readonly<{ result: SiteAuditResult }>) {
  const t = useTranslations("projectSiteAudit");
  const [sorting, setSorting] = useState<DataTableSort | null>(null);
  const [selectedPage, setSelectedPage] = useState<SiteAuditPage | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const coverage = auditCoverage(result);
  function issueMessage(issue: SiteAuditIssue) {
    if (issue.code === "fetch_failed")
      return t(`fetchReasons.${auditFailureReason(issue.message)}`);
    if (Object.hasOwn(numericIssueKeys, issue.code)) {
      const key = numericIssueKeys[issue.code as keyof typeof numericIssueKeys];
      return t(key, { count: Number(issue.message.match(/\d+/)?.[0] ?? 0) });
    }
    if (Object.hasOwn(plainIssueKeys, issue.code)) {
      const key = plainIssueKeys[issue.code as keyof typeof plainIssueKeys];
      return t(key);
    }
    return issue.message;
  }
  const columns: DataTableColumn<AuditRow>[] = [
    {
      id: "url",
      accessorKey: "url",
      header: t("columns.0"),
      size: 320,
      minSize: 240,
      meta: { flex: 2 },
      cell: ({ row }) => (
        <div className="grid min-w-0 gap-1">
          <span className="truncate font-mono text-[11px]" title={row.original.url}>
            {row.original.url}
          </span>
          <span className="truncate text-fg-muted" title={row.original.title ?? undefined}>
            {hasAuditContent(row.original)
              ? (row.original.title ?? t("noTitle"))
              : t("notAssessed")}
          </span>
          <span className="text-[11px] text-fg-muted">
            {row.original.status === null ? t("notMeasured") : `${row.original.responseTimeMs} ms`}
            {hasAuditContent(row.original) ? ` · ${row.original.h1Count} H1` : ""}
          </span>
        </div>
      ),
    },
    {
      id: "status",
      accessorKey: "status",
      header: t("columns.1"),
      size: 85,
      minSize: 80,
      cell: ({ row }) => (
        <span className="font-mono">{row.original.status ?? t("notFetched")}</span>
      ),
    },
    {
      id: "indexable",
      accessorKey: "indexable",
      header: t("columns.2"),
      size: 110,
      minSize: 100,
      cell: ({ row }) =>
        hasAuditContent(row.original)
          ? row.original.indexable
            ? t("yes")
            : t("no")
          : t("unknown"),
    },
    {
      id: "links",
      accessorKey: "internalLinkCount",
      header: t("columns.3"),
      size: 160,
      minSize: 150,
      cell: ({ row }) =>
        !hasAuditContent(row.original) ? (
          t("notAssessed")
        ) : (
          <div className="grid gap-0.5 text-[11px] text-fg-muted">
            <span>{t("internal", { count: row.original.internalLinkCount })}</span>
            <span>{t("external", { count: row.original.externalLinkCount })}</span>
            <span>{t("images", { count: row.original.imageCount })}</span>
          </div>
        ),
    },
    {
      id: "issues",
      accessorFn: (row) => row.issues.length,
      header: t("columns.4"),
      size: 350,
      minSize: 250,
      meta: { flex: 2 },
      cell: ({ row }) => (
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className="min-w-0 flex-1">
            {row.original.issues.length ? (
              row.original.issues.slice(0, 2).map((issue) => (
                <p
                  className={`m-0 truncate text-[12px] ${issue.severity === "error" ? "text-red-text" : "text-fg-muted"}`}
                  title={issueMessage(issue)}
                  key={issue.code}
                >
                  {issueMessage(issue)}
                </p>
              ))
            ) : (
              <PillBadge>{t("passed")}</PillBadge>
            )}
          </div>
          <Button
            size="xs"
            variant="ghost"
            onClick={() => {
              setSelectedPage(row.original);
              setDetailsOpen(true);
            }}
          >
            {t("details")}
          </Button>
        </div>
      ),
    },
  ];
  return (
    <div className="grid min-w-0 gap-4">
      <SummaryStrip
        sentence={t(coverage.unavailable ? "unavailableSummary" : "summary", {
          ...result.summary,
          ...coverage,
        })}
        tone={result.summary.errors ? "dropped" : "steady"}
      />
      {result.state === "partial" ? (
        <p className="m-0 text-[13px] text-fg-muted" role="status">
          {result.stopReason === "finished"
            ? t("partialUnavailable")
            : t("partial", { reason: t(`stopReasons.${result.stopReason}`) })}
        </p>
      ) : null}
      <Card className="overflow-hidden p-0">
        <div className="px-4 py-3 text-[14px] font-semibold">{t("urlIssues")}</div>
        <DataTable<AuditRow>
          ariaLabel={t("urlIssues")}
          bordered={false}
          columns={columns}
          density="comfortable"
          id="site-audit-results"
          layout="auto"
          onSortingChange={setSorting}
          rows={result.pages.map((page) => ({ ...page, id: page.url }))}
          sorting={sorting}
          sortingMode="client"
        />
      </Card>
      <AppDrawer
        open={detailsOpen}
        onClose={() => setDetailsOpen(false)}
        onExited={() => setSelectedPage(null)}
        title={t("details")}
        description={selectedPage?.url}
        sheetOnMobile
      >
        {selectedPage ? (
          <div className="grid min-w-0 gap-4 text-[13px]">
            <dl className="m-0 grid gap-3">
              <div>
                <dt className="text-fg-muted">{t("columns.0")}</dt>
                <dd className="m-0 break-all">
                  {hasAuditContent(selectedPage)
                    ? (selectedPage.title ?? t("noTitle"))
                    : t("notAssessed")}
                </dd>
              </div>
              <div>
                <dt className="text-fg-muted">{t("descriptionLabel")}</dt>
                <dd className="m-0">
                  {hasAuditContent(selectedPage)
                    ? (selectedPage.description ?? t("missing"))
                    : t("notAssessed")}
                </dd>
              </div>
              <div>
                <dt className="text-fg-muted">{t("canonicalLabel")}</dt>
                <dd className="m-0 break-all">
                  {hasAuditContent(selectedPage)
                    ? (selectedPage.canonical ?? t("missing"))
                    : t("notAssessed")}
                </dd>
              </div>
              <div>
                <dt className="text-fg-muted">{t("robotsLabel")}</dt>
                <dd className="m-0">
                  {hasAuditContent(selectedPage)
                    ? (selectedPage.robots ?? t("noDirective"))
                    : t("notAssessed")}
                </dd>
              </div>
            </dl>
            {selectedPage.headings.map((heading, index) => (
              <p className="m-0" key={`${index}:${heading.text}`}>
                H{heading.level}: {heading.text}
              </p>
            ))}
            {selectedPage.issues.length ? (
              <ul className="m-0 grid gap-2 pl-4">
                {selectedPage.issues.map((issue) => (
                  <li
                    className={issue.severity === "error" ? "text-red-text" : "text-fg-muted"}
                    key={issue.code}
                  >
                    {issueMessage(issue)}
                  </li>
                ))}
              </ul>
            ) : (
              <PillBadge>{t("passed")}</PillBadge>
            )}
          </div>
        ) : null}
      </AppDrawer>
      <p className="m-0 text-[11px] leading-relaxed text-fg-muted">{t("limitations")}</p>
    </div>
  );
}
