"use client";

import { SearchInsightsRowsCard } from "@/components/search-insights/SearchInsightsRowsCard";
import { Button } from "@/components/ui/Button";
import type { DataTableColumn } from "@/components/ui/data-table/data-table-types";
import { InlineCallout } from "@/components/ui/InlineCallout";
import { useToast } from "@/components/ui/toast-context";
import type {
  IndexingBackgroundRun,
  SitemapSnapshot,
  StoredSitemap,
} from "@/lib/search-index/ui-model";
import { useRouter } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { useRef, useTransition } from "react";
import { groupSitemaps } from "./history-presentation";
import { IndexingSitemapChecks } from "./IndexingSitemapChecks";
import { IndexingPath, IndexingTable } from "./IndexingTable";
import { useViewerTimeZone } from "./use-viewer-time-zone";

type Row = ReturnType<typeof groupSitemaps>[number];

export function IndexingSitemaps({
  rows = [],
  snapshot,
  backgroundRun,
  onRead,
}: Readonly<{
  onRead?: () => Promise<{ status: "ok" | "rate_limited" | "error" }>;
  rows?: StoredSitemap[];
  snapshot?: SitemapSnapshot;
  backgroundRun?: IndexingBackgroundRun;
}>) {
  const router = useRouter();
  const [reading, startRead] = useTransition();
  const { showToast } = useToast();
  const inFlight = useRef(false);
  const read = () => {
    if (!onRead || inFlight.current) return;
    inFlight.current = true;
    startRead(async () => {
      try {
        const result = await onRead();
        if (result.status !== "ok")
          showToast(
            t(result.status === "rate_limited" ? "sitemapReadRateLimited" : "sitemapReadFailed"),
            { severity: result.status === "rate_limited" ? "info" : "error" },
          );
      } catch {
        showToast(t("sitemapReadFailed"), { severity: "error" });
      } finally {
        inFlight.current = false;
      }
      router.refresh();
    });
  };
  const t = useTranslations("projectSearchInsights.indexing");
  const format = useFormatter();
  const timeZone = useViewerTimeZone();
  const date = (value: string | null) =>
    value
      ? format.dateTime(new Date(value), { timeZone, dateStyle: "medium", timeStyle: "short" })
      : "-";
  const downloaded = (value: string | null) =>
    value
      ? format.dateTime(new Date(value), {
          timeZone,
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
        })
      : "-";
  const status = (row: Row) => (
    <div className="flex flex-col gap-1 whitespace-normal text-ui-caption">
      {row.noLongerSubmitted ? <span>{t("sitemapRemoved")}</span> : null}
      {row.isPending ? <span>{t("sitemapPending")}</span> : null}
      {row.errors ? <span>{t("sitemapErrors", { count: row.errors })}</span> : null}
      {row.warnings ? <span>{t("sitemapWarnings", { count: row.warnings })}</span> : null}
      {!row.noLongerSubmitted && !row.isPending && !row.errors && !row.warnings
        ? t("sitemapOk")
        : null}
    </div>
  );
  const columns: DataTableColumn<Row>[] = [
    {
      id: "path",
      header: t("sitemap"),
      size: 140,
      meta: { flex: 1 },
      enableSorting: false,
      cell: ({ row }) => (
        <div style={{ paddingLeft: row.original.depth * 16 }}>
          <IndexingPath value={row.original.path} />
        </div>
      ),
    },
    {
      id: "type",
      header: t("sitemapType"),
      size: 100,
      enableSorting: false,
      cell: ({ row: { original: row } }) => (
        <span className="whitespace-normal">
          {row.isIndex
            ? t("sitemapIndex", { count: row.childCount })
            : row.parentPath
              ? t("sitemapChild")
              : t("sitemapPlain")}
        </span>
      ),
    },
    {
      id: "total",
      header: t("urls"),
      size: 96,
      meta: { align: "end" },
      enableSorting: false,
      cell: ({ row }) =>
        row.original.isIndex
          ? t("sitemapTotal", { count: row.original.submitted })
          : format.number(row.original.submitted),
    },
    {
      id: "checks",
      header: t("ourChecks"),
      size: 168,
      enableSorting: false,
      cell: ({ row }) => <IndexingSitemapChecks checks={row.original.checks} />,
    },
    {
      id: "downloaded",
      header: t("googleLastRead"),
      size: 156,
      enableSorting: false,
      cell: ({ row }) => (
        <span className="whitespace-nowrap">{downloaded(row.original.lastDownloaded)}</span>
      ),
    },
    {
      id: "status",
      header: t("sitemapStatus"),
      size: 132,
      enableSorting: false,
      cell: ({ row }) => status(row.original),
    },
  ];
  // Until the data follow-up supplies a snapshot, keep the existing stored-origin view honest.
  const legacy: DataTableColumn<StoredSitemap>[] = [
    {
      id: "path",
      header: t("sitemap"),
      size: 160,
      meta: { flex: 1 },
      enableSorting: false,
      cell: ({ row }) => <IndexingPath value={row.original.id} />,
    },
    {
      id: "total",
      header: t("discoveredUrls"),
      size: 160,
      meta: { align: "end" },
      enableSorting: false,
      cell: ({ row }) => format.number(row.original.total),
    },
  ];
  return (
    <div className="flex min-w-0 flex-col gap-2">
      {snapshot?.lastError ? (
        <InlineCallout tint="yellow" role="alert">
          {t(`sitemapReadErrors.${snapshot.lastError}`, {
            failed: date(snapshot.lastErrorAt),
            success: date(snapshot.readAt),
          })}
        </InlineCallout>
      ) : null}
      <SearchInsightsRowsCard
        title={t("sitemaps")}
        headerEnd={
          onRead ? (
            <Button loading={reading} size="xs" variant="secondary" onClick={read}>
              {t(snapshot?.readAt ? "refreshSitemaps" : "readSitemaps")}
            </Button>
          ) : undefined
        }
        caption={
          snapshot
            ? snapshot.readAt
              ? t("sitemapReadAt", { date: date(snapshot.readAt) })
              : backgroundRun?.state === "scheduled" && backgroundRun.nextAt
                ? t("sitemapNextRun", { date: date(backgroundRun.nextAt) })
                : t(`sitemapSchedule.${backgroundRun?.state ?? "unavailable"}`)
            : t("sitemapStoredOnly")
        }
        expandable={false}
        empty={snapshot ? !snapshot.readAt || !snapshot.rows.length : !rows.length}
        emptyReason={
          snapshot
            ? !snapshot.readAt
              ? t("sitemapsNotRead")
              : t("noSitemapsSubmitted")
            : t("noSitemaps")
        }
      >
        {snapshot ? (
          <IndexingTable
            id="indexing-sitemaps"
            label={t("sitemaps")}
            columns={columns}
            rows={groupSitemaps(snapshot.rows)}
          />
        ) : (
          <IndexingTable
            id="indexing-sitemaps"
            label={t("sitemaps")}
            columns={legacy}
            rows={rows}
          />
        )}
      </SearchInsightsRowsCard>
    </div>
  );
}
