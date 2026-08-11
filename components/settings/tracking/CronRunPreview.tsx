import type { CronPreviewResult } from "@/lib/actions/settings-cron-preview";
import { CheckCircleIcon as CheckCircle, WarningIcon as Warning } from "@phosphor-icons/react";

export function CronRunPreview({
  pending,
  preview,
}: Readonly<{ pending: boolean; preview: CronPreviewResult }>) {
  if (pending) {
    return (
      <div aria-live="polite" className="mt-3 text-[12px] text-fg-muted">
        Calculating the next cron anchors...
      </div>
    );
  }

  if (preview.status === "invalid") {
    return (
      <div
        aria-live="polite"
        className="mt-3 flex items-start gap-2 rounded-[9px] border border-yellow-border bg-yellow-soft px-3 py-2.5 text-[12px] text-yellow-text"
      >
        <Warning aria-hidden className="mt-0.5 shrink-0" size={15} weight="fill" />
        {preview.message}
      </div>
    );
  }

  if (preview.status !== "ready") return null;

  return (
    <div
      aria-live="polite"
      className="mt-3 rounded-[9px] border border-border-soft bg-bg-sunken p-3"
    >
      <div className="flex items-center gap-2 text-[12px] font-semibold text-fg">
        <CheckCircle aria-hidden className="text-green-text" size={15} weight="fill" />
        Next three cron anchors
      </div>
      <ol className="m-0 mt-2 grid list-none gap-2 p-0 sm:grid-cols-3">
        {preview.runs.map((run, index) => (
          <li className="font-mono text-[11.5px] text-fg-muted" key={run}>
            <span className="mr-1 text-fg-muted">{index + 1}.</span>
            {run}
          </li>
        ))}
      </ol>
      <p className="m-0 mt-2 text-[11px] text-fg-muted">{preview.message}</p>
    </div>
  );
}
