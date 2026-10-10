"use client";
import { AppDrawer } from "@/components/ui/AppDrawer";
import { PillBadge } from "@/components/ui/Pill";
import { trackingSourceLabel } from "@/lib/ai-tracking/projections/trends";
import type { TrackingSampleRow } from "@/lib/ai-tracking/projections/workspace";
import { useTranslations } from "next-intl";
export function TrackingEvidenceDrawer({
  sample,
  onClose,
}: Readonly<{ sample: TrackingSampleRow | null; onClose: () => void }>) {
  const t = useTranslations("projectAiTracking");
  const evidence = sample?.evidence;
  return (
    <AppDrawer
      open={Boolean(sample)}
      title={t("sampleEvidence")}
      onClose={onClose}
      description={t("aRetainedObservationWithItsSourceAndMeasurement")}
      sheetOnMobile
      autoFocusClose
    >
      {sample && (
        <div className="space-y-5 text-sm">
          <div className="flex flex-wrap gap-2">
            <PillBadge>{sample.measurement.replaceAll("_", " ")}</PillBadge>
            <PillBadge>{trackingSourceLabel[sample.source]}</PillBadge>
            <PillBadge>{evidence?.recordedSource ?? t("unknownFreshness")}</PillBadge>
          </div>
          <div>
            <p className="text-xs font-mono uppercase text-fg-muted">
              Exact prompt · {sample.promptRevisionId}
            </p>
            <p className="mt-2 leading-6">{sample.prompt}</p>
          </div>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
            <dt className="text-fg-muted">{t("actualModel")}</dt>
            <dd>{evidence?.actualModel ?? t("unknown")}</dd>
            <dt className="text-fg-muted">{t("requestedLocale")}</dt>
            <dd>{evidence?.requestedLocale ?? t("unknown")}</dd>
            <dt className="text-fg-muted">{t("effectiveLocale")}</dt>
            <dd>{evidence?.effectiveLocale ?? t("unknown")}</dd>
            <dt className="text-fg-muted">{t("observed")}</dt>
            <dd className="break-all">{evidence?.observedAt ?? t("notObserved")}</dd>
            <dt className="text-fg-muted">{t("cost")}</dt>
            <dd>
              {sample.costUsd === null ? t("unknown") : `$${sample.costUsd}`} · {sample.costState}
            </dd>
          </dl>
          <section className="rounded-card border border-border bg-bg-sunken p-4">
            <h3 className="mb-3 font-semibold">{t("answer")}</h3>
            <p className="whitespace-pre-wrap leading-6">
              {evidence?.answerText ??
                (sample.measurement === "aio_not_present"
                  ? t("noAIOverviewWasPresentThisIsNot")
                  : t("noCompleteAnswerIsAvailableForThisSample"))}
            </p>
            {evidence?.answerTruncated && (
              <p className="mt-3 text-xs text-fg-muted">
                {t("answerTruncatedAtTheRetentionLimit")}
              </p>
            )}
          </section>
          <section>
            <h3 className="mb-3 font-semibold">Cited sources · {sample.citations.length}</h3>
            {sample.citations.length ? (
              <ol className="space-y-3">
                {sample.citations.map((citation) => (
                  <li key={citation.position}>
                    <a
                      className="break-all text-accent-text underline underline-offset-4"
                      href={/^https?:\/\//.test(citation.url) ? citation.url : undefined}
                      rel="noopener noreferrer"
                      target="_blank"
                    >
                      {citation.title ?? citation.url}
                    </a>
                    <p className="mt-1 break-all text-xs text-fg-muted">{citation.url}</p>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-fg-muted">{t("noCitationsWereRetained")}</p>
            )}
            <p className="mt-4 text-xs leading-5 text-fg-muted">
              {t("searchResultsNotCitedInTheAnswerAre")}
            </p>
          </section>
        </div>
      )}
    </AppDrawer>
  );
}
