"use client";

import { Button } from "@/components/ui";
import { migrationImportCountSummary } from "@/lib/migration/import-counts";
import { appPath } from "@/lib/routing/app-path";
import {
  ArrowsClockwiseIcon as ArrowsClockwise,
  CaretRightIcon as CaretRight,
  CheckCircleIcon as CheckCircle,
  CloudArrowDownIcon as CloudArrowDown,
  DatabaseIcon as Database,
  DownloadSimpleIcon as DownloadSimple,
  type Icon,
  LinkIcon,
  WarningIcon as Warning,
  WarningOctagonIcon as WarningOctagon,
} from "@phosphor-icons/react";
import type { CloudImportJobData } from "./cloud-token";

type TransferState = CloudImportJobData["state"];
type Tone = "neutral" | "blue" | "green" | "red";

type StateConfig = {
  desc: string;
  icon: Icon;
  pill: string;
  title: string;
  tone: Tone;
  weight: "regular" | "fill";
};

const TONES: Record<Tone, { tile: string; text: string; dot: string }> = {
  blue: { tile: "bg-blue/15 text-blue-text", text: "text-blue-text", dot: "bg-blue" },
  green: { tile: "bg-green/15 text-green-text", text: "text-green-text", dot: "bg-green" },
  neutral: { tile: "bg-bg-sunken text-fg-muted", text: "text-fg-muted", dot: "bg-fg-muted" },
  red: { tile: "bg-red/10 text-red-text", text: "text-red-text", dot: "bg-red" },
};

function countEntries(counts: unknown) {
  if (!counts || typeof counts !== "object" || Array.isArray(counts)) {
    return [];
  }

  return Object.entries(counts)
    .filter(([, value]) => typeof value === "number")
    .map(([key, value]) => `${value} ${key.replaceAll("_", " ")}`);
}

function doneDescription(job: CloudImportJobData) {
  const summary = migrationImportCountSummary(job.counts);
  if (!summary.reportsKeywordCreations && summary.imported.length === 0) {
    return "Import completed. Re-connect providers to resume checks.";
  }
  const imported =
    summary.imported.length > 0
      ? `Imported ${summary.imported.join(", ")}.`
      : `Imported ${summary.keywordsCreated} new keywords.`;
  const skipped = summary.skipped.length > 0 ? ` ${summary.skipped.join(", ")} skipped.` : "";
  return `${imported}${skipped} Re-connect providers to resume checks.`;
}

function configFor(job: CloudImportJobData, sourceLabel: string): StateConfig {
  const configs: Record<TransferState, StateConfig> = {
    done: {
      desc: doneDescription(job),
      icon: CheckCircle,
      pill: "Done",
      title: "Transfer complete",
      tone: "green",
      weight: "fill",
    },
    failed: {
      desc: job.error ?? "The package was rejected. Generate a new token and push again.",
      icon: Warning,
      pill: "Failed",
      title: "Transfer failed",
      tone: "red",
      weight: "fill",
    },
    idle: {
      desc: `No package received yet. Once the ${sourceLabel} pushes, import progress appears here.`,
      icon: CloudArrowDown,
      pill: "Idle",
      title: "Waiting for transfer",
      tone: "neutral",
      weight: "regular",
    },
    importing: {
      desc: "Restoring keywords, ranking history, tags and alert rules into this project.",
      icon: Database,
      pill: "Importing",
      title: "Importing data",
      tone: "blue",
      weight: "regular",
    },
    receiving: {
      desc: "Receiving the export package from your self-hosted instance.",
      icon: DownloadSimple,
      pill: "Receiving",
      title: "Receiving package",
      tone: "blue",
      weight: "regular",
    },
  };

  return configs[job.state];
}

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
  job: CloudImportJobData;
  onNewToken: () => void;
  projectRef: string;
  sourceLabel?: string;
};

export function TransferPanel({
  job,
  onNewToken,
  projectRef,
  sourceLabel = "self-hosted instance",
}: Readonly<TransferPanelProps>) {
  const cfg = configFor(job, sourceLabel);
  const tone = TONES[cfg.tone];
  const StateIcon = cfg.icon;
  const counts = countEntries(job.counts);
  const showProgress =
    job.state === "receiving" || job.state === "importing" || job.state === "done";

  return (
    <div className="mt-[18px] overflow-hidden rounded-[14px] border border-border bg-bg-elev">
      <div className="flex items-center gap-[13px] p-[16px_20px]">
        <span
          className={`grid h-[38px] w-[38px] flex-none place-items-center rounded-[10px] ${tone.tile}`}
        >
          <StateIcon aria-hidden size={19} weight={cfg.weight} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[13.5px] font-semibold">{cfg.title}</div>
          <div className="mt-0.5 text-[12px] text-fg-muted">{cfg.desc}</div>
        </div>
        <span
          className={`inline-flex flex-none items-center gap-1.5 rounded-full bg-bg-sunken px-[11px] py-[5px] font-mono text-[10.5px] font-semibold ${tone.text}`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${tone.dot}`} />
          {cfg.pill}
        </span>
      </div>

      {showProgress ? (
        <div className="px-5 pb-4">
          <div className="h-1.5 overflow-hidden rounded-[3px] bg-bg-sunken">
            <div
              className={`h-full rounded-[3px] transition-[width] duration-500 ${job.state === "done" ? "bg-green" : "bg-blue"}`}
              style={{ width: `${job.progress}%` }}
            />
          </div>
        </div>
      ) : null}

      {counts.length > 0 ? (
        <div className="grid gap-2 border-border-soft border-t px-5 py-3 sm:grid-cols-3">
          {counts.map((item) => (
            <div className="rounded-[10px] bg-bg-sunken px-3 py-2 font-mono text-[11px]" key={item}>
              {item}
            </div>
          ))}
        </div>
      ) : null}

      {job.state === "done" ? (
        <div className="flex items-center gap-[9px] border-border-soft border-t p-[14px_20px]">
          <LinkIcon aria-hidden className="flex-none text-fg-muted" size={15} />
          <span className="min-w-0 flex-1 truncate font-mono text-[11.5px] text-fg-muted">
            Import job {job.id}
          </span>
          <a
            className="inline-flex flex-none items-center gap-1.5 rounded-lg bg-accent-solid px-[14px] py-2 font-semibold text-[12px] text-primary-contrast"
            href={appPath(projectRef, "dashboard")}
          >
            Open project
            <CaretRight aria-hidden size={12} weight="bold" />
          </a>
        </div>
      ) : null}

      {job.state === "failed" ? (
        <div className="flex flex-col gap-3 border-border-soft border-t p-[14px_20px]">
          <div className="flex items-start gap-2.5 rounded-[11px] border border-red bg-red/10 px-3.5 py-3">
            <WarningOctagon
              aria-hidden
              className="mt-px flex-none text-red-text"
              size={16}
              weight="fill"
            />
            <div className="min-w-0 flex-1 text-[12.5px] leading-[1.5] text-fg">
              <strong className="font-semibold">Import stopped at {job.progress}%.</strong>{" "}
              <span className="text-fg-muted">
                {job.error ?? "No partial data was written and this project is unchanged."}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-x-[11px] gap-y-2 font-mono text-[11px] text-fg-muted">
            <span className="text-red-text">failed</span>
            <span className="h-2.5 w-px bg-border-strong" />
            <span>transfer_id {job.id ?? "pending"}</span>
            {job.finishedAt ? (
              <>
                <span className="h-2.5 w-px bg-border-strong" />
                <span>{new Date(job.finishedAt).toLocaleString()}</span>
              </>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <Button
              onClick={onNewToken}
              size="sm"
              startIcon={<ArrowsClockwise aria-hidden size={13} />}
              sx={{ flex: "none" }}
              type="button"
              variant="primary"
            >
              New token
            </Button>
            <a
              className="inline-flex flex-none items-center gap-1.5 rounded-lg border border-border-strong bg-bg-elev px-[14px] py-2 font-semibold text-[12px] text-fg"
              download={`${job.id ?? "cloud-import"}-error.log`}
              href={errorLogHref(job)}
            >
              <DownloadSimple aria-hidden size={13} />
              Download error log
            </a>
            <span className="text-[12px] text-fg-muted">then push again from the source.</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
