"use client";
import { Button } from "@/components/ui/Button";
import type { TrackingSampleRow } from "@/lib/ai-tracking/projections/workspace";
import type { ProjectRunAi } from "@/lib/runs/project-run";
import { useTranslations } from "next-intl";
import { RunCost } from "./RunCost";
import { RunStatusChip } from "./RunStatusChip";
import { RunStatusSummary } from "./RunStatusSummary";
import { RunTimelineTime } from "./RunTimelineTime";
import { useRunStatusCopy } from "./run-status-copy";

function citationHref(value: string) {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) ? url.href : undefined;
  } catch {
    return undefined;
  }
}

export function AiRunResults({
  run,
  samples,
  backHref,
  nextHref,
}: Readonly<{
  run: ProjectRunAi;
  samples: TrackingSampleRow[];
  backHref: string;
  nextHref: string | null;
}>) {
  const t = useTranslations("projectRuns.aiResults");
  const copy = useRunStatusCopy();
  return (
    <div className="grid gap-5">
      <Button href={backHref} variant="ghost" size="sm">
        {t("back")}
      </Button>
      <header className="grid gap-2">
        <h1 className="text-[21px] font-semibold">{t("title")}</h1>
        <p className="font-mono text-xs text-fg-muted">{run.id}</p>
        <div className="flex flex-wrap items-center gap-3">
          <RunStatusChip {...copy.forRun(run)} />
          <RunStatusSummary run={run} />
          <RunCost cost={run.cost} />
          <RunTimelineTime run={run} />
        </div>
      </header>
      {samples.length ? (
        samples.map((sample) => (
          <article
            className="grid gap-3 rounded-card border border-border bg-bg-elev p-4"
            key={sample.id}
          >
            <h2 className="text-sm font-semibold">{sample.prompt}</h2>
            <p className="text-xs text-fg-muted">
              {sample.engine} · {t("measurement")}: {t(`measurements.${sample.measurement}`)}
            </p>
            {sample.evidence?.actualModel ? (
              <p className="text-xs text-fg-muted">
                {t("model")}: {sample.evidence.actualModel}
              </p>
            ) : null}
            {sample.evidence?.observedAt ? (
              <p className="text-xs text-fg-muted">
                {t("observed")}:{" "}
                <time dateTime={sample.evidence.observedAt}>{sample.evidence.observedAt}</time>
              </p>
            ) : null}
            {sample.evidence?.answerText ? (
              <section>
                <h3 className="mb-2 text-xs font-medium">{t("answer")}</h3>
                <p className="whitespace-pre-wrap break-words text-sm">
                  {sample.evidence.answerText}
                </p>
              </section>
            ) : null}
            {sample.citations.length ? (
              <section>
                <h3 className="mb-2 text-xs font-medium">{t("citations")}</h3>
                <ul className="grid gap-1">
                  {sample.citations.map((citation) => (
                    <li key={`${citation.url}:${citation.position}`} className="break-all text-xs">
                      <a
                        href={citationHref(citation.url)}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="text-accent-text underline"
                      >
                        {citation.title ?? citation.url}
                      </a>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </article>
        ))
      ) : (
        <p className="text-sm text-fg-muted">{t("empty")}</p>
      )}
      {nextHref ? (
        <Button href={nextHref} variant="secondary" size="sm">
          {t("next")}
        </Button>
      ) : null}
    </div>
  );
}
