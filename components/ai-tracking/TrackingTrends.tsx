"use client";
import { Button } from "@/components/ui/Button";
import { MenuSelect } from "@/components/ui/MenuSelect";
import type { TrackingRunRow, TrackingTrendView } from "@/lib/ai-tracking/projections/workspace";
import type { TrackingWorkspaceActions } from "@/lib/ai-tracking/projections/workspace-actions";
import { useTranslations } from "next-intl";
import { useRef, useState, useTransition } from "react";
export function TrackingTrends({
  runs,
  onCompare,
  onExport,
}: Readonly<{
  runs: TrackingRunRow[];
  onCompare: (current: string, previous: string) => Promise<TrackingTrendView>;
  onExport: TrackingWorkspaceActions["export"];
}>) {
  const t = useTranslations("projectAiTracking");
  const [current, setCurrent] = useState(runs[0]?.id ?? "");
  const [previous, setPrevious] = useState(runs[1]?.id ?? "");
  const [result, setResult] = useState<TrackingTrendView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const selectionVersion = useRef(0);
  const [download, setDownload] = useState<{
    loaded: number;
    complete: boolean;
    nextCursor: string | null;
    runId: string;
    format: "json" | "csv";
  } | null>(null);
  function exportRun(format: "json" | "csv", cursor?: string) {
    const request = ++selectionVersion.current;
    startTransition(async () => {
      try {
        const receipt = await onExport(current, format, cursor);
        if (selectionVersion.current !== request) return;
        setDownload({ ...receipt, runId: current, format });
        setError(null);
      } catch (cause) {
        if (selectionVersion.current !== request) return;
        setError(cause instanceof Error ? cause.message : t("historyUnavailable"));
      }
    });
  }
  const options = runs.map((run) => ({ value: run.id, label: `${run.createdAt} · ${run.state}` }));
  return (
    <section className="rounded-card border border-border bg-bg-elev p-4">
      <h2 className="text-sm font-semibold">{t("compareEvidence")}</h2>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <MenuSelect
          ariaLabel={t("currentRun")}
          value={current}
          onChange={(value) => {
            selectionVersion.current++;
            setCurrent(value);
            setResult(null);
            setDownload(null);
          }}
          options={options}
        />
        <MenuSelect
          ariaLabel={t("previousRun")}
          value={previous}
          onChange={(value) => {
            selectionVersion.current++;
            setPrevious(value);
            setResult(null);
          }}
          options={options}
        />
        <Button
          size="sm"
          variant="secondary"
          loading={pending}
          disabled={!current || !previous || current === previous}
          onClick={() =>
            startTransition(async () => {
              const request = ++selectionVersion.current;
              try {
                setError(null);
                const next = await onCompare(current, previous);
                if (selectionVersion.current === request) setResult(next);
              } catch (cause) {
                if (selectionVersion.current !== request) return;
                setError(cause instanceof Error ? cause.message : t("historyUnavailable"));
              }
            })
          }
        >
          {t("compare")}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={!current || pending}
          onClick={() => exportRun("csv")}
        >
          {t("exportCsv")}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={!current || pending}
          onClick={() => exportRun("json")}
        >
          {t("exportJson")}
        </Button>
      </div>
      {download && (
        <div className="mt-3 text-xs text-fg-muted" role="status">
          <p>
            {t(download.complete ? "exportCompleted" : "exportIncomplete", {
              count: download.loaded,
            })}
          </p>
          {download.nextCursor && (
            <Button
              className="mt-2"
              size="xs"
              variant="secondary"
              disabled={pending}
              onClick={() => exportRun(download.format, download.nextCursor ?? undefined)}
            >
              {t("exportContinue")}
            </Button>
          )}
        </div>
      )}
      {error && (
        <p className="mt-3 text-sm text-red-text" role="alert">
          {error}
        </p>
      )}
      {result && (
        <div className="mt-4 space-y-2 text-xs text-fg-muted">
          {result.strata?.map((stratum) => (
            <p key={stratum.category}>
              {stratum.category}: {stratum.previous.eligible}/{stratum.previous.expected} →{" "}
              {stratum.current.eligible}/{stratum.current.expected} ·{" "}
              {stratum.comparable && stratum.delta !== null
                ? `${(stratum.delta * 100).toFixed(1)} pp`
                : stratum.reason}
            </p>
          ))}
          <p className="font-medium text-fg">
            {result.comparable && result.delta !== null
              ? t("mentionDelta", { delta: (result.delta * 100).toFixed(1) })
              : result.reason}
          </p>
          {[result.previous, result.current]
            .filter((period) => period !== undefined)
            .map((period, index) => (
              <p key={index}>
                {t("denominators", {
                  expected: period.expected,
                  eligible: period.eligible,
                  coverage: (period.coverage * 100).toFixed(1),
                  partial: period.partial,
                  failed: period.failed,
                  absent: period.absentAio,
                  unknown: period.unknown,
                  missing: period.missing,
                })}
              </p>
            ))}
        </div>
      )}
      <p className="mt-3 text-xs leading-5 text-fg-muted">{t("trendMethod")}</p>
    </section>
  );
}
