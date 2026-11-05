import { RankResultMarker } from "@/components/checks/runs/RankResultMarker";
import type { ClientDeploymentMode } from "@/components/shell/DeploymentModeProvider";
import { dataLinkClassName } from "@/components/ui/data-link-styles";
import type { DataTableColumn } from "@/components/ui/data-table/data-table-types";
import { StatusChip } from "@/components/ui/StatusChip";
import { itemStatusChipPresentation } from "@/components/ui/status-chip-mapping";
import { providerLabel } from "@/lib/checks/provider-label";
import { deviceLabel } from "@/lib/queries/keyword-row-format";
import { appPath, type ProjectRef } from "@/lib/routing/app-path";
import { hasIncompleteObservation } from "@/lib/serp/rank-depth";
import Link from "next/link";
import type { useTranslations } from "next-intl";
import { DeferralReasonText } from "./deferral-reason-copy";
import type { RunPageData, RunPageItem } from "./RunPageTypes";

type RunTargetTableColumnsOptions = {
  deploymentMode: ClientDeploymentMode;
  locale: string;
  projectRef: ProjectRef;
  run: RunPageData;
  showNotes: boolean;
  statusT: ReturnType<typeof useTranslations<"shared.controls.status">>;
  t: ReturnType<typeof useTranslations<"projectRuns.rankRuns">>;
};

export { runTargetNote } from "./run-target-presentation";

import { runTargetNote, targetCost } from "./run-target-presentation";

export function runTargetTableColumns({
  deploymentMode,
  locale,
  projectRef,
  run,
  showNotes,
  statusT,
  t,
}: RunTargetTableColumnsOptions): readonly DataTableColumn<RunPageItem>[] {
  const columns: DataTableColumn<RunPageItem>[] = [
    {
      accessorFn: (item) => item.keyword.text,
      cell: ({ row }) => (
        <Link
          className={`block truncate font-semibold ${dataLinkClassName}`}
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
        const messageKey =
          row.original.blockedReason === "send_unconfirmed" ? "notConfirmed" : status.messageKey;
        return <StatusChip {...status} messageKey={messageKey} label={statusT(messageKey)} />;
      },
      enableSorting: false,
      header: t("status"),
      id: "status",
      meta: { lockResize: true, title: t("status") },
      minSize: 128,
      size: 136,
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
      accessorFn: (item) =>
        item.status === "deferred" ? null : (item.rankCheck?.position ?? null),
      cell: ({ row }) =>
        row.original.status === "deferred" || row.original.status === "queued" ? (
          t("unavailable")
        ) : row.original.rankCheck?.evidenceProjection?.result === "partial" ||
          row.original.rankCheck?.evidenceProjection?.result === "recovered" ? (
          <RankResultMarker
            evidence={row.original.rankCheck.evidenceProjection}
            position={row.original.rankCheck.position}
          />
        ) : (
          (row.original.rankCheck?.position ??
          (row.original.status === "completed" &&
          row.original.rankCheck &&
          !row.original.rankCheck.errorCode &&
          row.original.rankCheck.requestedDepth &&
          row.original.rankCheck.requestedDepth > 0
            ? !hasIncompleteObservation(row.original.rankCheck.observationCompleteness) &&
              (row.original.rankCheck.organicCoverageDepth ?? 0) >=
                row.original.rankCheck.requestedDepth
              ? t("targetPresentation.notInTop", { depth: row.original.rankCheck.requestedDepth })
              : t("targetPresentation.coverageUnknown")
            : t("unavailable")))
        ),
      enableSorting: false,
      header: t("table.position"),
      id: "position",
      meta: { align: "end", lockResize: true, title: t("table.position") },
      minSize: 160,
      size: 200,
    },
    {
      accessorFn: (item) => item.rankCheck?.provider ?? "",
      cell: ({ row }) =>
        row.original.status === "queued"
          ? t("unavailable")
          : row.original.rankCheck?.provider
            ? providerLabel(row.original.rankCheck.provider)
            : t("unavailable"),
      enableSorting: false,
      header: t("provider"),
      id: "provider",
      meta: { lockResize: true, title: t("provider") },
      minSize: 136,
      size: 160,
    },
    {
      accessorFn: (item) => item.payment?.charge.value ?? "",
      cell: ({ row }) => targetCost(row.original, locale, t),
      enableSorting: false,
      header: t("cost"),
      id: "cost",
      meta: { align: "end", lockResize: true, title: t("cost") },
      minSize: 160,
      size: 180,
    },
  ];
  if (showNotes) {
    columns.push({
      accessorFn: (item) => runTargetNote(item, run, deploymentMode, t, locale),
      cell: ({ row }) => {
        const itemNote = runTargetNote(row.original, run, deploymentMode, t, locale);
        const hasDetails = row.original.status === "deferred" || row.original.accountBlocks?.length;
        return hasDetails ? (
          <div className="text-[11.5px] leading-[1.4] text-fg-muted">
            {itemNote ? <p className="m-0">{itemNote}</p> : null}
            {row.original.status === "deferred" ? (
              <DeferralReasonText
                code={row.original.deferralCode ?? "unknown"}
                projectRef={projectRef}
              />
            ) : null}
            {row.original.accountBlocks?.map((block) => (
              <p className="m-0" key={`${block.connectionId}:${block.reason}`}>
                {t(`accountBlock.${block.reason}`, { provider: block.provider })}
              </p>
            ))}
          </div>
        ) : (
          <span
            className={`block text-[11.5px] text-fg-muted ${row.original.rankCheck?.errorCode === "organic_depth_not_covered" || row.original.rankCheck?.attempts?.some((attempt) => attempt.outcome !== "ok") ? "whitespace-normal leading-5" : "truncate"}`}
            title={itemNote}
          >
            {itemNote}
          </span>
        );
      },
      enableSorting: false,
      header: t("targetPresentation.note"),
      id: "note",
      meta: { flex: 0.9, lockResize: true, title: t("targetPresentation.note") },
      minSize: 320,
      size: 360,
    });
  }
  return columns;
}
