"use client";

import { useDateDisplay } from "@/components/dates/DateFormatProvider";
import { StatTile } from "@/components/ui/StatTile";
import type { AiVisibilityOverview } from "@/lib/ai-tracking/overview-model";
import { formatDisplayDate, formatDisplayDateRange } from "@/lib/dates/format";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { overviewEngineCopy, overviewEngineLabel, overviewList } from "./overview-labels";

export function AiVisibilityOverviewStats({
  overview,
}: Readonly<{ overview: AiVisibilityOverview }>) {
  const t = useTranslations("projectAiTracking");
  const format = useFormatter();
  const locale = useLocale();
  const display = useDateDisplay();
  const labels = overviewEngineCopy((key) => t(key));
  const { cited, mentioned, project, shareOfVoice } = overview;
  const share =
    !shareOfVoice || shareOfVoice.mentions === 0
      ? t("overview.unknownCount")
      : format.number(shareOfVoice.mentions / shareOfVoice.total, {
          maximumFractionDigits: 0,
          style: "percent",
        });
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <StatTile
        caption={t("overview.mentionedDetail", {
          brand: project.label,
          named: mentioned.named,
          total: mentioned.total,
          unbranded: mentioned.unbrandedTotal,
          unbrandedNamed: mentioned.unbrandedNamed,
        })}
        label={t("overview.mentioned")}
        value={t("overview.countOf", { count: mentioned.named, total: mentioned.total })}
      />
      <StatTile
        caption={
          project.domain
            ? t("overview.citedDetail", {
                cited: cited.cited,
                domain: project.domain,
                links: cited.links,
                total: cited.total,
                unbranded: cited.unbrandedTotal,
                unbrandedCited: cited.unbrandedCited,
              })
            : t("overview.citedNoDomain", {
                cited: cited.cited,
                links: cited.links,
                total: cited.total,
                unbranded: cited.unbrandedTotal,
                unbrandedCited: cited.unbrandedCited,
              })
        }
        label={t("overview.cited")}
        value={t("overview.countOf", { count: cited.cited, total: cited.total })}
      />
      <StatTile
        caption={shareDetail(shareOfVoice, project.label, format, t)}
        label={t("overview.shareOfVoice")}
        value={share}
      />
      <StatTile
        caption={coverage(overview, labels, locale, display, format, t)}
        label={t("overview.answers")}
        value={format.number(overview.totalAnswers)}
      />
    </div>
  );
}

function shareDetail(
  voice: AiVisibilityOverview["shareOfVoice"],
  brand: string,
  format: ReturnType<typeof useFormatter>,
  t: ReturnType<typeof useTranslations<"projectAiTracking">>,
) {
  if (!voice) return t("overview.shareEmpty");
  if (voice.leader.own) {
    return t("overview.shareLeads", { brand, mentions: voice.mentions, total: voice.total });
  }
  return t("overview.shareDetail", {
    leader: voice.leader.label,
    leaderShare: format.number(voice.leader.mentions / voice.total, {
      maximumFractionDigits: 0,
      style: "percent",
    }),
    mentions: voice.mentions,
    total: voice.total,
  });
}

function coverage(
  overview: AiVisibilityOverview,
  labels: ReturnType<typeof overviewEngineCopy>,
  locale: string,
  display: ReturnType<typeof useDateDisplay>,
  format: ReturnType<typeof useFormatter>,
  t: ReturnType<typeof useTranslations<"projectAiTracking">>,
) {
  const parts: string[] = [];
  if (overview.coverage.engines.length) {
    parts.push(
      overviewList(
        locale,
        overview.coverage.engines.map((engine) => overviewEngineLabel(engine, labels)),
      ),
    );
  }
  const [first, ...rest] = overview.coverage.dates;
  const last = rest.at(-1);
  if (first && !last) parts.push(formatDisplayDate(first, display));
  if (first && last) parts.push(formatDisplayDateRange(first, last, display));
  if (overview.coverage.costMicros !== null) {
    parts.push(
      t("overview.costTotal", {
        cost: format.number(overview.coverage.costMicros / 1_000_000, {
          currency: "USD",
          maximumFractionDigits: 4,
          style: "currency",
        }),
      }),
    );
  }
  return parts.length ? parts.join(" · ") : t("overview.answersDetail");
}
