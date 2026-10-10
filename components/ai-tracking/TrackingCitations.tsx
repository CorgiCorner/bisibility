"use client";
import { Button } from "@/components/ui/Button";
import { trackingCitationGroups } from "@/lib/ai-tracking/projections/citations";
import type { TrackingSampleRow } from "@/lib/ai-tracking/projections/workspace";
import { useTranslations } from "next-intl";

export function TrackingCitations({
  samples,
  expected,
  hasMore,
  runId,
  onSelectSample,
}: Readonly<{
  samples: TrackingSampleRow[];
  expected: number;
  hasMore: boolean;
  runId: string;
  onSelectSample: (sample: TrackingSampleRow) => void;
}>) {
  const t = useTranslations("projectAiTracking");
  const groups = trackingCitationGroups(samples);
  return (
    <section className="rounded-card border border-border bg-bg-elev p-4">
      <h2 className="text-sm font-semibold">{t("citedSources")}</h2>
      <p className="mt-2 text-xs text-fg-muted">
        {t("citationScope", { run: runId, loaded: samples.length, expected })}
      </p>
      <p className="mt-1 text-xs text-fg-muted">
        {hasMore ? t("citationScopeIncomplete") : t("citationScopeMethod")}
      </p>
      {groups.length ? (
        groups.map((group) => (
          <details className="mt-3 rounded-control border border-border p-3" key={group.domain}>
            <summary className="cursor-pointer break-words text-sm font-medium focus-visible:outline-2 focus-visible:outline-accent">
              {group.domain} · {t("citationAnswers", { count: group.sampleCount })} ·{" "}
              {t("citationUrls", { count: group.urls.length })}
            </summary>
            {group.urls.map((entry) => (
              <details key={entry.url} className="mt-3 border-t border-border-soft pt-3">
                <summary className="cursor-pointer break-all text-xs focus-visible:outline-2 focus-visible:outline-accent">
                  {entry.url} · {t("citationAnswers", { count: entry.samples.length })}
                </summary>
                <ul className="mt-2 space-y-2">
                  {entry.samples.map((sample) => (
                    <li key={sample.id}>
                      <Button
                        variant="ghost"
                        size="xs"
                        className="h-auto max-w-full whitespace-normal text-left"
                        onClick={() => onSelectSample(sample)}
                      >
                        <span className="min-w-0 break-words">
                          {sample.prompt}
                          <span className="mt-1 block font-mono text-[10px] text-fg-muted">
                            {sample.promptRevisionId} · {sample.id} · {sample.source} ·{" "}
                            {sample.measurement}
                          </span>
                        </span>
                      </Button>
                    </li>
                  ))}
                </ul>
              </details>
            ))}
          </details>
        ))
      ) : (
        <p className="mt-3 text-sm text-fg-muted">{t("noCitedSourcesInLoadedEvidence")}</p>
      )}
    </section>
  );
}
