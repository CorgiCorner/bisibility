import type { ClientDeploymentMode } from "@/components/shell/DeploymentModeProvider";
import type { DataTableColumn } from "@/components/ui/data-table/data-table-types";
import { StatusChip } from "@/components/ui/StatusChip";
import { itemStatusChipPresentation } from "@/components/ui/status-chip-mapping";
import { deviceLabel } from "@/lib/queries/keyword-row-format";
import { isUnrunnableReason } from "@/lib/rank-check/runnable-reasons";
import { appPath, type ProjectRef } from "@/lib/routing/app-path";
import Link from "next/link";
import type { useTranslations } from "next-intl";
import type { RunPageData, RunPageItem } from "./RunPageTypes";
import { localizedBlockedRunCopy } from "./rank-run-copy";

type RunTargetTableColumnsOptions = {
  deploymentMode: ClientDeploymentMode;
  locale: string;
  projectRef: ProjectRef;
  run: RunPageData;
  showNotes: boolean;
  statusT: ReturnType<typeof useTranslations<"shared.controls.status">>;
  t: ReturnType<typeof useTranslations<"projectRuns.rankRuns">>;
};

export function runTargetNote(
  item: RunPageItem,
  run: RunPageData,
  deploymentMode: ClientDeploymentMode,
  t: ReturnType<typeof useTranslations<"projectRuns.rankRuns">>,
  locale: string,
) {
  if (
    item.blockedReason === "target_paused" ||
    item.blockedReason === "location_language_unavailable"
  ) {
    return localizedBlockedRunCopy({ deploymentMode, reason: item.blockedReason }, t, locale)
      .compact;
  }
  if (isUnrunnableReason(item.blockedReason)) {
    return localizedBlockedRunCopy({ deploymentMode, reason: item.blockedReason }, t, locale)
      .compact;
  }
  if (item.status === "skipped" || item.status === "blocked") {
    return t("targetPresentation.skippedBeforeStart");
  }
  if (run.status === "blocked" && item.status === "queued") {
    return localizedBlockedRunCopy(
      {
        budget: run.budget,
        deploymentMode,
        reason: run.blockedReason,
      },
      t,
      locale,
    ).compact;
  }
  if (item.rankCheck?.errorCode === "provider_billing")
    return t("targetPresentation.providerBilling");
  if (item.rankCheck?.errorCode === "provider_account_restricted")
    return t("targetPresentation.providerRestricted");
  if (item.rankCheck?.errorCode === "provider_auth") return t("targetPresentation.providerAuth");
  if (item.rankCheck?.errorCode === "provider_rate_limited")
    return t("targetPresentation.providerRateLimited");
  if (item.rankCheck?.errorCode === "provider_transient")
    return t("targetPresentation.providerTransient");
  return item.rankCheck?.errorCode ? t("targetPresentation.providerUnknown") : "";
}

export function runTargetTableColumns({
  deploymentMode,
  locale,
  projectRef,
  run,
  showNotes,
  statusT,
  t,
}: RunTargetTableColumnsOptions): readonly DataTableColumn<RunPageItem>[] {
  const money = (value: number | null) =>
    value === null
      ? t("unavailable")
      : new Intl.NumberFormat(locale, { currency: "USD", style: "currency" }).format(value / 100);
  const columns: DataTableColumn<RunPageItem>[] = [
    {
      accessorFn: (item) => item.keyword.text,
      cell: ({ row }) => (
        <Link
          className="block truncate font-semibold text-fg no-underline hover:text-accent-text"
          href={appPath(projectRef, "rank-tracker", row.original.keyword.publicId)}
        >
          {row.original.keyword.text}
        </Link>
      ),
      enableSorting: false,
      header: t("keyword"),
      id: "keyword",
      meta: { flex: 1.4, lockResize: true, title: t("keyword") },
      minSize: 192,
      size: 248,
    },
    {
      accessorFn: (item) => item.status,
      cell: ({ row }) => {
        const status = itemStatusChipPresentation(
          run.status === "blocked" && row.original.status === "queued"
            ? "blocked"
            : row.original.status,
        );
        return <StatusChip {...status} label={statusT(status.messageKey)} />;
      },
      enableSorting: false,
      header: t("status"),
      id: "status",
      meta: { lockResize: true, title: t("status") },
      minSize: 112,
      size: 120,
    },
    {
      accessorFn: (item) => `${item.keyword.location} ${item.keyword.languageLabel ?? ""}`,
      cell: ({ row }) => (
        <span className="font-semibold text-fg">
          {row.original.keyword.location}
          {row.original.keyword.languageLabel ? ` / ${row.original.keyword.languageLabel}` : ""}
        </span>
      ),
      enableSorting: false,
      header: t("table.market"),
      id: "market",
      meta: { flex: 0.6, lockResize: true, title: t("table.market") },
      minSize: 168,
      size: 184,
    },
    {
      accessorFn: (item) => deviceLabel(item.keyword.device),
      cell: ({ row }) => deviceLabel(row.original.keyword.device),
      enableSorting: false,
      header: t("table.device"),
      id: "device",
      meta: { lockResize: true, title: t("table.device") },
      minSize: 100,
      size: 108,
    },
    {
      accessorFn: (item) => item.rankCheck?.position ?? null,
      cell: ({ row }) => row.original.rankCheck?.position ?? t("unavailable"),
      enableSorting: false,
      header: t("table.position"),
      id: "position",
      meta: { align: "end", lockResize: true, title: t("table.position") },
      minSize: 104,
      size: 112,
    },
    {
      accessorFn: (item) => item.actualCostCents ?? item.estimatedCostCents,
      cell: ({ row }) => money(row.original.actualCostCents ?? row.original.estimatedCostCents),
      enableSorting: false,
      header: t("cost"),
      id: "cost",
      meta: { align: "end", lockResize: true, title: t("cost") },
      minSize: 88,
      size: 96,
    },
  ];
  if (showNotes) {
    columns.push({
      accessorFn: (item) => runTargetNote(item, run, deploymentMode, t, locale),
      cell: ({ row }) => {
        const itemNote = runTargetNote(row.original, run, deploymentMode, t, locale);
        return (
          <span className="block truncate text-[11.5px] text-fg-muted" title={itemNote}>
            {itemNote}
          </span>
        );
      },
      enableSorting: false,
      header: t("targetPresentation.note"),
      id: "note",
      meta: { flex: 0.9, lockResize: true, title: t("targetPresentation.note") },
      minSize: 176,
      size: 200,
    });
  }
  return columns;
}
