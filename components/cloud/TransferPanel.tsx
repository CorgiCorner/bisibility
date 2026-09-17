"use client";

import { useDateDisplay } from "@/components/dates/DateFormatProvider";
import { Button } from "@/components/ui/Button";
import { IdChip } from "@/components/ui/IdChip";
import { formatDisplayDateTime } from "@/lib/dates/format";
import { migrationImportPresentation } from "@/lib/migration/import-counts";
import type { Icon } from "@phosphor-icons/react";
import { ArrowsClockwiseIcon as ArrowsClockwise } from "@phosphor-icons/react/dist/csr/ArrowsClockwise";
import { CheckCircleIcon as CheckCircle } from "@phosphor-icons/react/dist/csr/CheckCircle";
import { CloudArrowDownIcon as CloudArrowDown } from "@phosphor-icons/react/dist/csr/CloudArrowDown";
import { DatabaseIcon as Database } from "@phosphor-icons/react/dist/csr/Database";
import { DownloadSimpleIcon as DownloadSimple } from "@phosphor-icons/react/dist/csr/DownloadSimple";
import { WarningIcon as Warning } from "@phosphor-icons/react/dist/csr/Warning";
import { WarningOctagonIcon as WarningOctagon } from "@phosphor-icons/react/dist/csr/WarningOctagon";
import { useLocale, useTranslations } from "next-intl";
import { CloudImportCompletedFooter } from "./CloudImportCompletedFooter";
import type { CloudImportJobData } from "./cloud-token";
import { useCloudImportCountLabels } from "./useCloudImportCountLabels";

type TransferState = CloudImportJobData["state"];
type Tone = "blue" | "green" | "neutral" | "red" | "yellow";

type StateConfig = {
  desc: string;
  icon: Icon;
  pill: string;
  title: string;
  tone: Tone;
  weight: "regular" | "fill";
};

const TONES: Record<Tone, { dot: string; tile: string; toneClass: string }> = {
  blue: { dot: "bg-blue", tile: "bg-blue/15 text-blue-text", toneClass: "text-blue-text" },
  green: { dot: "bg-green", tile: "bg-green/15 text-green-text", toneClass: "text-green-text" },
  neutral: { dot: "bg-fg-muted", tile: "bg-bg-sunken text-fg-muted", toneClass: "text-fg-muted" },
  red: { dot: "bg-red", tile: "bg-red/10 text-red-text", toneClass: "text-red-text" },
  yellow: {
    dot: "bg-yellow",
    tile: "bg-yellow/15 text-yellow-text",
    toneClass: "text-yellow-text",
  },
};

function errorLogHref(job: CloudImportJobData) {
  const log = [
    `transfer_id=${job.id ?? "pending"}`,
    `state=${job.state}`,
    `progress=${job.progress}`,
    `message=${job.error ?? "Instance import failed."}`,
  ].join("\n");

  return `data:text/plain;charset=utf-8,${encodeURIComponent(log)}`;
}

type TransferPanelProps = {
  hasToken?: boolean;
  job: CloudImportJobData;
  onNewToken: () => void;
  projectRef: string;
  sourceLabel?: string;
};

export function TransferPanel({
  hasToken = false,
  job,
  onNewToken,
  projectRef,
  sourceLabel,
}: Readonly<TransferPanelProps>) {
  const dateDisplay = useDateDisplay();
  const locale = useLocale();
  const t = useTranslations("cloudImport");
  const countLabels = useCloudImportCountLabels();
  const resolvedSourceLabel = sourceLabel ?? t("source.selfHost");

  function list(items: string[]) {
    return new Intl.ListFormat(locale, { style: "long", type: "conjunction" }).format(items);
  }

  function doneDescription() {
    const summary = migrationImportPresentation(job.counts);
    const visibility = summary.unknownDepth
      ? t("transfer.completion.visibilityNote", { count: summary.unknownDepth })
      : "none";
    const imported = summary.imported.map(countLabels.summary);
    const skipped = summary.skipped.map(countLabels.summary);

    if (!summary.reportsKeywordCreations && imported.length === 0) {
      return t("transfer.completion.empty", { visibility });
    }
    const items = imported.length
      ? list(imported)
      : countLabels.summary({ key: "keywords_created", value: summary.keywordsCreated });
    return skipped.length
      ? t("transfer.completion.importedWithSkipped", {
          items,
          skipped: list(skipped),
          visibility,
        })
      : t("transfer.completion.imported", { items, visibility });
  }

  const presentation = migrationImportPresentation(job.counts);
  const restoredWithNotes =
    job.state === "done" && (presentation.skipped.length > 0 || presentation.unknownDepth > 0);
  const completedDescription = doneDescription();
  const configs: Record<TransferState, StateConfig> = {
    done: {
      desc: completedDescription,
      icon: CheckCircle,
      pill: t("transfer.successPill"),
      title: t("transfer.successTitle"),
      tone: "green",
      weight: "fill",
    },
    failed: {
      desc:
        job.error === "Import timed out."
          ? t("transfer.failed.timedOut")
          : t("transfer.failed.fallback"),
      icon: Warning,
      pill: t("transfer.failedPill"),
      title: t("transfer.failedTitle"),
      tone: "red",
      weight: "fill",
    },
    idle: {
      desc: t("transfer.readyDescription"),
      icon: CloudArrowDown,
      pill: t("transfer.readyPill"),
      title: t("transfer.readyTitle"),
      tone: "neutral",
      weight: "regular",
    },
    importing: {
      desc: t("transfer.importingDescription"),
      icon: Database,
      pill: t("transfer.importingPill"),
      title: t("transfer.importingTitle"),
      tone: "blue",
      weight: "regular",
    },
    receiving: {
      desc: t("transfer.receivingDescription", { source: resolvedSourceLabel }),
      icon: DownloadSimple,
      pill: t("transfer.receivingPill"),
      title: t("transfer.receivingTitle"),
      tone: "blue",
      weight: "regular",
    },
  };
  if (job.state === "idle" && !hasToken) {
    return null;
  }

  const cfg = restoredWithNotes
    ? {
        desc: completedDescription,
        icon: Warning,
        pill: t("transfer.notesPill"),
        title: t("transfer.notesTitle"),
        tone: "yellow" as const,
        weight: "fill" as const,
      }
    : configs[job.state];
  const tone = TONES[cfg.tone];
  const StateIcon = cfg.icon;
  const counts = presentation.entries.map((item) => ({
    key: item.key,
    label: countLabels.tile(item),
  }));
  const showProgress =
    job.state === "receiving" || job.state === "importing" || job.state === "done";

  return (
    <div className="mt-4.5 overflow-hidden rounded-card border border-border bg-bg-elev">
      <div className="flex items-center gap-[13px] p-[16px_20px]">
        <span
          className={`grid h-[38px] w-[38px] flex-none place-items-center rounded-control ${tone.tile}`}
        >
          <StateIcon aria-hidden size={19} weight="regular" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[13.5px] font-semibold">{cfg.title}</div>
          <div className="mt-0.5 text-[12px] text-fg-muted">{cfg.desc}</div>
        </div>
        <span
          className={`inline-flex flex-none items-center gap-1.5 rounded-full bg-bg-sunken px-[11px] py-[5px] font-sans tabular-nums text-[10.5px] font-semibold ${tone.toneClass}`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${tone.dot}`} />
          {cfg.pill}
        </span>
      </div>

      {showProgress ? (
        <div className="px-5 pb-4">
          <div className="h-1.5 overflow-hidden rounded-control bg-bg-sunken">
            <div
              className={`h-full rounded-control transition-[width] duration-500 ${
                job.state === "done" ? (restoredWithNotes ? "bg-yellow" : "bg-green") : "bg-blue"
              }`}
              style={{ width: `${job.progress}%` }}
            />
          </div>
        </div>
      ) : null}

      {counts.length > 0 ? (
        <div className="grid gap-2 border-border border-t px-5 py-3 sm:grid-cols-3">
          {counts.map((item) => (
            <div
              className="rounded-control bg-bg-sunken px-3 py-2 font-sans tabular-nums text-[11px]"
              key={item.key}
            >
              {item.label}
            </div>
          ))}
        </div>
      ) : null}

      {job.state === "done" ? (
        <CloudImportCompletedFooter
          copyImportJobLabel={t("token.copy", { label: t("transfer.importJob") })}
          importJobId={job.id}
          importJobLabel={t("transfer.importJob")}
          openProjectLabel={t("transfer.openProject")}
          projectRef={projectRef}
        />
      ) : null}

      {job.state === "failed" ? (
        <div className="flex flex-col gap-3 border-border border-t p-[14px_20px]">
          <div className="flex items-start gap-2.5 rounded-control border border-red bg-red/10 px-3.5 py-3">
            <WarningOctagon
              aria-hidden
              className="mt-px flex-none text-red-text"
              size={16}
              weight="regular"
            />
            <div className="min-w-0 flex-1 text-[12.5px] leading-[1.5] text-fg">
              <strong className="font-semibold">
                {t("transfer.failed.stopped", { progress: job.progress })}
              </strong>{" "}
              <span className="text-fg-muted">{t("transfer.failed.followUp")}</span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-x-[11px] gap-y-2 font-sans tabular-nums text-[11px] text-fg-muted">
            <span className="text-red-text">{t("transfer.failedPill")}</span>
            <span className="h-2.5 w-px bg-border" />
            <span className="inline-flex flex-wrap items-center gap-1.5">
              {t("transfer.importJob")}
              {job.id ? (
                <IdChip
                  copyLabel={t("token.copy", { label: t("transfer.importJob") })}
                  size="xs"
                  value={job.id}
                />
              ) : (
                t("transfer.pending")
              )}
            </span>
            {job.finishedAt ? (
              <>
                <span className="h-2.5 w-px bg-border" />
                <span>{formatDisplayDateTime(new Date(job.finishedAt), dateDisplay)}</span>
              </>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <Button
              onClick={onNewToken}
              size="sm"
              startIcon={<ArrowsClockwise aria-hidden size={13} weight="regular" />}
              style={{ flex: "none" }}
              type="button"
              variant="primary"
            >
              {t("transfer.newToken")}
            </Button>
            <a
              className="inline-flex flex-none items-center gap-1.5 rounded-control border border-border-control bg-bg-elev px-3.5 py-2 font-semibold text-[12px] text-fg"
              download={`${job.id ?? "cloud-import"}-error.log`}
              href={errorLogHref(job)}
            >
              <DownloadSimple aria-hidden size={13} weight="regular" />
              {t("transfer.downloadErrorLog")}
            </a>
            <span className="text-[12px] text-fg-muted">{t("transfer.retryFromSource")}</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
