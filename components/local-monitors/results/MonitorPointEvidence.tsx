"use client";
import { Button } from "@/components/ui/Button";
import { DataTable } from "@/components/ui/data-table/DataTable";
import type { DataTableColumn } from "@/components/ui/data-table/data-table-types";
import type {
  LocalHistoryWindow,
  LocalMonitorRunResult,
  LocalPointHistory,
  LocalResultListing,
  LocalResultPoint,
} from "@/lib/local-monitor-results/model";
import {
  readLocalPointHistoryAction,
  readLocalPointListingsAction,
} from "@/lib/local-monitor-results/session-actions";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
export function MonitorPointEvidence({
  report,
  point,
  window,
}: {
  report: LocalMonitorRunResult;
  point: LocalResultPoint;
  window?: LocalHistoryWindow;
}) {
  const t = useTranslations("shared.localMonitors");
  const query = useQuery({
    queryKey: [
      "local-point-evidence-v1",
      report.projectId,
      report.monitorId,
      report.runId,
      report.asOf,
      point.id,
    ],
    queryFn: () => {
      const command = {
        projectId: report.projectId,
        monitorId: report.monitorId,
        runId: report.runId,
        targetId: point.id,
        asOf: report.asOf,
      };
      return readLocalPointListingsAction(command);
    },
    retry: false,
  });
  const historyQuery = useInfiniteQuery({
    queryKey: [
      "local-point-history-v1",
      report.projectId,
      report.monitorId,
      report.runId,
      report.asOf,
      point.id,
      window?.from ?? null,
      window?.to ?? null,
    ],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      readLocalPointHistoryAction({
        projectId: report.projectId,
        monitorId: report.monitorId,
        runId: report.runId,
        targetId: point.id,
        asOf: report.asOf,
        ...(pageParam ? { cursor: pageParam } : {}),
        ...(window?.from ? { from: window.from } : {}),
        ...(window ? { to: window.to } : {}),
      }),
    getNextPageParam: (last: LocalPointHistory) => last.nextCursor ?? undefined,
    retry: false,
  });
  const rows = query.data,
    history = historyQuery.data,
    failed = query.isError || historyQuery.isError;
  const columns: DataTableColumn<LocalResultListing>[] = [
    {
      id: "name",
      header: t("results.business"),
      cell: ({ row }) => row.original.name ?? t("results.unknown"),
    },
    {
      id: "group",
      header: t("results.nativeGroup"),
      cell: ({ row }) => row.original.rankGroup ?? t("results.unknown"),
    },
    {
      id: "absolute",
      header: t("results.nativeAbsolute"),
      cell: ({ row }) => row.original.rankAbsolute ?? t("results.unknown"),
    },
    {
      id: "promotion",
      header: t("results.promotion"),
      cell: ({ row }) => t(`results.promotionStates.${row.original.promotion}`),
    },
    {
      id: "match",
      header: t("results.identityMatch"),
      cell: ({ row }) => t(`results.matchStates.${row.original.matched}`),
    },
  ];
  return (
    <section className="space-y-3" aria-label={t("results.pointEvidence")}>
      <h3 className="font-semibold">
        {t("point")} {point.ordinal + 1}: {point.latitude}, {point.longitude}
      </h3>
      <p className="text-sm">
        {t("results.scope")}: {point.surface}, {point.language}, {point.device},{" "}
        {point.operatingSystem ?? t("results.unknown")}, {t("fields.cutoff")}: {point.cutoff},{" "}
        {t("fields.zoom")}: {point.zoom ?? t("results.unknown")}
      </p>
      <p className="text-sm">
        {t("results.evidence")}: {t(`results.evidenceStates.${point.evidence}`)};{" "}
        {t("results.reason")}:{" "}
        {point.reason ? t(`results.reasonStates.${point.reason}`) : t("results.none")};{" "}
        {t("results.identityMatch")}: {t(`results.matchStates.${point.identityMatch}`)};{" "}
        {t("results.observedRank")}: {point.observedPosition ?? t("results.unknown")}
      </p>
      {history ? (
        <div className="space-y-2">
          <h4 className="font-semibold">{t("results.pointHistory")}</h4>
          <p className="text-sm text-fg-muted">{t("results.pointHistoryHelp")}</p>
          <ol>
            {history.pages
              .flatMap((page) => page.items)
              .map((item) => (
                <li key={item.id} className="text-sm">
                  <time dateTime={item.observedAt ?? item.createdAt}>
                    {item.observedAt ?? item.createdAt}
                  </time>
                  : {t("results.rank")} {item.position ?? t("results.unknown")} ·{" "}
                  {t(`results.evidenceStates.${item.evidence}`)}
                </li>
              ))}
          </ol>
          {historyQuery.hasNextPage ? (
            <Button
              variant="outline"
              disabled={historyQuery.isFetchingNextPage}
              onClick={() => void historyQuery.fetchNextPage()}
            >
              {t("results.pointHistoryMore")}
            </Button>
          ) : null}
        </div>
      ) : null}
      {failed ? (
        <p role="alert">{t("readError")}</p>
      ) : rows ? (
        <DataTable
          id="local-point-listings"
          ariaLabel={t("results.pointEvidence")}
          columns={columns}
          rows={[...rows]}
          sorting={null}
          onSortingChange={() => undefined}
        />
      ) : (
        <p>{t("results.loading")}</p>
      )}
    </section>
  );
}
