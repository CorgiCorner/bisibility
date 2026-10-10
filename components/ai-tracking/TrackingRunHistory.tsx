"use client";
import { Button } from "@/components/ui/Button";
import { PillBadge } from "@/components/ui/Pill";
import { trackingSourceLabel } from "@/lib/ai-tracking/projections/trends";
import type { TrackingRunRow, TrackingSampleRow } from "@/lib/ai-tracking/projections/workspace";
import { useTranslations } from "next-intl";
export function TrackingRunHistory({
  runs,
  samples,
  canWrite,
  onSelectRun,
  onSelectSample,
  onCancel,
}: Readonly<{
  runs: TrackingRunRow[];
  samples: TrackingSampleRow[];
  canWrite: boolean;
  onSelectRun: (id: string) => void;
  onSelectSample: (sample: TrackingSampleRow) => void;
  onCancel: (id: string) => void;
}>) {
  const t = useTranslations("projectAiTracking");
  return (
    <section className="space-y-4">
      <div className="overflow-hidden rounded-card border border-border bg-bg-elev">
        {runs.length ? (
          runs.map((run) => (
            <div
              key={run.id}
              className="flex flex-wrap items-center justify-between gap-3 border-b border-border-soft p-4 last:border-0"
            >
              <button
                type="button"
                className="min-w-0 text-left hover:text-accent-text focus-visible:outline-2 focus-visible:outline-accent"
                onClick={() => onSelectRun(run.id)}
              >
                <span className="font-mono text-xs">{run.id}</span>
                <p className="mt-1 text-xs text-fg-muted">
                  {run.createdAt} · {run.sampleCount} samples
                </p>
              </button>
              <div className="flex items-center gap-2">
                <PillBadge>{run.state}</PillBadge>
                {["planned", "running"].includes(run.state) && (
                  <Button
                    size="xs"
                    variant="ghost"
                    disabled={!canWrite}
                    onClick={() => onCancel(run.id)}
                  >
                    {t("cancel")}
                  </Button>
                )}
              </div>
            </div>
          ))
        ) : (
          <p className="p-8 text-center text-sm text-fg-muted">
            {t("noRunsYetPreviewAConfigurationToBegin")}
          </p>
        )}
      </div>
      {samples.length > 0 && (
        <div className="rounded-card border border-border bg-bg-elev">
          <h2 className="border-b border-border p-4 text-sm font-semibold">
            {t("sampleEvidence")}
          </h2>
          {samples.map((sample) => (
            <button
              type="button"
              className="flex w-full flex-wrap items-center justify-between gap-3 border-b border-border-soft p-4 text-left hover:bg-bg-sunken focus-visible:outline-2 focus-visible:outline-accent last:border-0"
              key={sample.id}
              onClick={() => onSelectSample(sample)}
            >
              <span className="max-w-[75%] text-sm leading-5">
                {sample.prompt}
                <span className="mt-1 block text-xs text-fg-muted">
                  {trackingSourceLabel[sample.source]} · {sample.engine} ·{" "}
                  {sample.costUsd === null ? t("costUnknown") : `$${sample.costUsd}`}
                </span>
              </span>
              <PillBadge>{sample.measurement.replaceAll("_", " ")}</PillBadge>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
