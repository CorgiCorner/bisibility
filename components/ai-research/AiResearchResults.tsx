"use client";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import type { AiResearchResult } from "@/lib/ai-research/types";
import { useTranslations } from "next-intl";

export function AiResearchResults({ result }: Readonly<{ result: AiResearchResult }>) {
  const t = useTranslations("projectAiResearch");
  if (result.failure && !result.rows.length)
    return (
      <Card role="alert" className="text-ui-body text-red-text">
        {t("partialFailure")}
      </Card>
    );
  if (!result.rows.length)
    return <EmptyState title={t("noObservations")} description={t("coverageDisclaimer")} />;
  return (
    <section className="grid min-w-0 gap-4" aria-label="Analysis results">
      <Card className="flex flex-wrap items-center gap-4 text-ui-body">
        <span className="font-medium">
          {result.evidence === "observed_dataset" ? t("observedDataset") : t("syntheticTest")}
        </span>
        <span className="text-fg-muted">
          {t("summary", {
            answers: result.rows.length,
            mentions: result.rows.filter((row) => row.brandMentioned).length,
            citations: result.rows.filter((row) => row.domainCited).length,
          })}
        </span>
        <span className="text-ui-xs tabular-nums">
          {t(result.costStatus === "unknown" ? "unknownCost" : "actualCost", {
            cost: result.costCents.toFixed(2),
          })}
        </span>
      </Card>
      {result.truncated ? (
        <p className="text-ui-body text-fg-muted">
          {t("sample", { total: result.totalAvailable ?? result.rows.length })}
        </p>
      ) : null}
      {result.failure ? (
        <Card role="alert" className="text-ui-body text-red-text">
          {t("partialFailure")}
        </Card>
      ) : null}
      <div className="grid min-w-0 gap-4 lg:grid-cols-2">
        {result.rows.map((row, index) => (
          <Card key={`${row.model}:${index}`} className="grid min-w-0 content-start gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-mono text-ui-xs text-fg-muted">{row.model}</span>
              <span className="text-ui-xs text-fg-muted">
                {row.brandMentioned ? t("brandMentioned") : t("noBrandMention")} ·{" "}
                {row.domainCited ? t("domainCited") : t("noDomainCitation")}
              </span>
            </div>
            <h2 className="text-ui-body font-semibold">{row.prompt}</h2>
            {row.contentTruncated ? (
              <p className="text-ui-xs text-fg-muted">{t("contentTruncated")}</p>
            ) : null}
            <p className="whitespace-pre-wrap break-words text-ui-body leading-relaxed">
              {row.answer || t("noAnswer")}
            </p>
            {row.observedAt ? (
              <p className="text-ui-xs tabular-nums text-fg-muted">
                {t(result.evidence === "synthetic_prompt_test" ? "generatedAt" : "observedAt", {
                  date: row.observedAt,
                })}
              </p>
            ) : null}
            <div className="grid gap-1 border-t border-border pt-3">
              <span className="text-ui-xs uppercase text-fg-muted">{t("citedPages")}</span>
              {row.citations.length ? (
                row.citations.map((citation) => (
                  <a
                    key={citation.url}
                    href={citation.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="break-words text-ui-body text-accent-text underline underline-offset-4"
                  >
                    {citation.title}
                    {citation.targetDomain ? ` · ${t("yourDomain")}` : ""}
                  </a>
                ))
              ) : (
                <span className="text-ui-body text-fg-muted">{t("noCitations")}</span>
              )}
            </div>
          </Card>
        ))}
      </div>
    </section>
  );
}
