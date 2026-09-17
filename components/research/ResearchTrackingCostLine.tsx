"use client";

import { useFormatter, useTranslations } from "next-intl";
import { formatResearchEstimateCents } from "./research-money";
import type { ResearchTrackingCostFact } from "./research-tracking-cost";

function frequencyLabel(
  frequency: ResearchTrackingCostFact["frequency"],
  t: ReturnType<typeof useTranslations<"projectResearch.detail">>,
) {
  if (frequency === "custom_cron") return t("frequencyCustomCron");
  if (frequency === "daily") return t("frequencyDaily");
  if (frequency === "manual") return t("frequencyManual");
  if (frequency === "monthly") return t("frequencyMonthly");
  if (frequency === "paused") return t("frequencyPaused");
  return t("frequencyWeekly");
}

export function ResearchTrackingCostLine({ fact }: Readonly<{ fact: ResearchTrackingCostFact }>) {
  const format = useFormatter();
  const t = useTranslations("projectResearch.detail");
  const frequency = frequencyLabel(fact.frequency, t);
  const displayFrequency =
    fact.kind === "estimated" && fact.projectDefault
      ? t("frequencyProjectDefault", { frequency })
      : frequency;

  const line =
    fact.kind === "zero"
      ? t("trackingCostZero")
      : fact.kind === "custom_cron"
        ? t("trackingCostCustomCron")
        : fact.kind === "unavailable"
          ? t("trackingCostUnavailable", {
              frequency: displayFrequency,
              locationCount: fact.locationCount,
            })
          : t.rich("trackingCostEstimated", {
              cost: formatResearchEstimateCents(fact.costCents, format.number),
              frequency: displayFrequency,
              value: (chunks) => <span className="text-fg">{chunks}</span>,
            });

  return (
    <p className="mb-3 mt-2 font-sans tabular-nums text-[11.5px] leading-5 text-fg-muted">{line}</p>
  );
}
