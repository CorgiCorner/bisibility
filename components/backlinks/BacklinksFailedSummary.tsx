"use client";

import type { BacklinksFailedSummary as FailedSummary } from "@/lib/backlinks/types";
import { useFormatter, useTranslations } from "next-intl";

export function BacklinksFailedSummary({ evidence }: Readonly<{ evidence: FailedSummary }>) {
  const t = useTranslations("projectBacklinks.workspace.failedSummary");
  const summary = useTranslations("projectBacklinks.workspace.summary");
  const format = useFormatter();
  const metrics = [
    [summary("backlinks"), format.number(evidence.summary.backlinksTotal)],
    [summary("referringDomains"), format.number(evidence.summary.referringDomainsTotal)],
    [summary("domainRank"), format.number(evidence.summary.domainRank)],
    [summary("referringPages"), format.number(evidence.summary.referringPages)],
    [summary("brokenBacklinks"), format.number(evidence.summary.brokenBacklinks)],
    [summary("brokenPages"), format.number(evidence.summary.brokenPages)],
    [
      summary("dofollowLinks"),
      format.number(evidence.summary.dofollowPct / 100, { style: "percent" }),
    ],
    [summary("targetSpam"), format.number(evidence.summary.spamScore)],
  ];
  const cost = format.number(evidence.knownSummaryCostCents / 100, {
    currency: "USD",
    maximumFractionDigits: 4,
    minimumFractionDigits: 2,
    style: "currency",
  });

  return (
    <section
      aria-label={t("title")}
      className="grid min-w-0 gap-3 rounded-card border border-border bg-bg-elev p-4 sm:p-5"
    >
      <div role="status" className="grid gap-1.5">
        <h3 className="m-0 text-[15px] font-semibold text-red-text">{t("title")}</h3>
        <p className="m-0 break-words text-[13px] text-fg-muted">
          {t("description", { target: evidence.target })}
        </p>
        <p className="m-0 text-[13px] font-semibold">{t("costUnknown")}</p>
        <p className="m-0 text-[13px] text-fg-muted">{t("knownSummaryCost", { cost })}</p>
      </div>
      <dl className="m-0 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {metrics.map(([label, value]) => (
          <div className="grid min-w-0 gap-1" key={label}>
            <dt className="text-[12px] text-fg-muted">{label}</dt>
            <dd className="m-0 font-sans text-[18px] font-semibold tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
