"use client";
import { Button } from "@/components/ui/Button";
import { DataTable } from "@/components/ui/data-table/DataTable";
import type { DataTableColumn } from "@/components/ui/data-table/data-table-types";
import { PillBadge } from "@/components/ui/Pill";
import type { TrackingPromptRow } from "@/lib/ai-tracking/projections/workspace";
import { useMediaQuery } from "@/lib/ui/use-media-query";
import { useTranslations } from "next-intl";
export function TrackingPromptTable({
  prompts,
  canWrite,
  onEdit,
  onArchive,
  selection,
  onSelectionChange,
}: Readonly<{
  prompts: TrackingPromptRow[];
  canWrite: boolean;
  onEdit: (prompt: TrackingPromptRow) => void;
  onArchive: (prompt: TrackingPromptRow) => void;
  selection: ReadonlySet<string>;
  onSelectionChange: (next: ReadonlySet<string>) => void;
}>) {
  const t = useTranslations("projectAiTracking");
  const narrow = useMediaQuery("(max-width:640px)");
  const columns: DataTableColumn<TrackingPromptRow>[] = [
    {
      id: "prompt",
      header: t("prompt"),
      size: narrow ? 220 : 400,
      minSize: 220,
      meta: { pin: "left", lockVisible: true },
      cell: ({ row }) => (
        <div className="py-2">
          <button
            type="button"
            disabled={!canWrite}
            className="line-clamp-2 text-left text-sm font-medium leading-5 hover:text-accent-text focus-visible:outline-2 focus-visible:outline-accent"
            onClick={() => onEdit(row.original)}
          >
            {row.original.text}
          </button>
          <p className="mt-1 font-mono text-[10px] text-fg-muted">{row.original.id}</p>
        </div>
      ),
    },
    {
      id: "topic",
      header: t("topic"),
      size: 190,
      cell: ({ row }) => <span className="text-xs">{row.original.topicName}</span>,
    },
    {
      id: "revision",
      header: t("revision"),
      size: 100,
      cell: ({ row }) => <span className="font-mono text-xs">v{row.original.revision}</span>,
    },
    {
      id: "status",
      header: t("status"),
      size: 100,
      cell: ({ row }) => <PillBadge>{row.original.status}</PillBadge>,
    },
    {
      id: "source",
      header: t("source"),
      size: 185,
      cell: ({ row }) => (
        <div className="max-h-12 overflow-y-auto text-xs">
          {row.original.sourceProvenance && row.original.sourceProvenance !== "manual" && (
            <p className="text-fg-muted">
              {row.original.sourceProvenance === "provider_dataset"
                ? t("providerDatasetPrompt")
                : t("generatedPrompt")}
            </p>
          )}
          {row.original.sources?.length ? (
            row.original.sources.map((source) => (
              <p key={source}>
                {source === "consumer_scrape"
                  ? t("consumerScraper")
                  : source === "model_api"
                    ? t("modelAPI")
                    : t("googleAIOverview")}
              </p>
            ))
          ) : (
            <span className="text-fg-muted">{t("sourceNotConfigured")}</span>
          )}
          {row.original.sourceScopeLimited && (
            <span className="text-fg-muted">{t("limitedScheduleSources")}</span>
          )}
        </div>
      ),
    },
    {
      id: "lastResult",
      header: t("lastResult"),
      size: 220,
      cell: ({ row }) =>
        row.original.lastResult ? (
          <div className="text-xs" title={row.original.lastResult.text}>
            <PillBadge>{row.original.lastResult.measurement.replaceAll("_", " ")}</PillBadge>
            <p className="mt-1 text-fg-muted">
              {row.original.lastResult.observedAt ?? t("observationTimeUnknown")}
            </p>
            <p className="mt-1 font-mono text-[10px] text-fg-muted">
              {row.original.lastResult.revisionId}
            </p>
          </div>
        ) : (
          <span className="text-xs text-fg-muted">{t("noResultYet")}</span>
        ),
    },
    {
      id: "nextRun",
      header: t("nextRun"),
      size: 190,
      cell: ({ row }) => (
        <span className="text-xs text-fg-muted">
          {row.original.status !== "active" ? (
            row.original.status
          ) : (
            <>
              {row.original.nextRunAt ?? (!row.original.nextRunPending ? t("notScheduled") : "")}
              {row.original.nextRunPending && <span className="block">{t("nextRunPending")}</span>}
            </>
          )}
        </span>
      ),
    },
    {
      id: "actions",
      header: t("actions"),
      size: 160,
      cell: ({ row }) => (
        <div className="flex gap-1">
          <Button
            size="xs"
            variant="ghost"
            disabled={!canWrite || row.original.status === "archived"}
            onClick={() => onEdit(row.original)}
          >
            {t("edit")}
          </Button>
          <Button
            size="xs"
            variant="ghost"
            disabled={!canWrite || row.original.status === "archived"}
            onClick={() => onArchive(row.original)}
          >
            {t("archive")}
          </Button>
        </div>
      ),
    },
  ];
  return (
    <DataTable
      id="ai-tracking-prompts"
      ariaLabel={t("trackedPrompts")}
      columns={columns}
      rows={prompts}
      columnSizing={{ prompt: narrow ? 220 : 400 }}
      columnPinning={{ left: ["prompt"] }}
      selection={selection}
      onSelectionChange={onSelectionChange}
      selectable={(row) => canWrite && row.status !== "archived"}
      sorting={null}
      onSortingChange={() => {}}
      density="standard"
      emptyState={
        <div className="p-10 text-center">
          <p className="font-semibold">{t("startWithAQuestionYourCustomersAsk")}</p>
          <p className="mt-2 text-sm text-fg-muted">{t("addATopicAndAPromptNothingRuns")}</p>
        </div>
      }
    />
  );
}
