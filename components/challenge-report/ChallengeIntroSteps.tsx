"use client";

import type { IntroductionStep } from "@/components/ui/IntroductionExplainer";
import { PillBadge } from "@/components/ui/Pill";
import { cn } from "@/lib/ui/cn";
import { useFormatter, useTranslations } from "next-intl";

// Illustrative pattern: some days checked in, some missed, the rest upcoming.
const HABIT = "cccmccmmcccc" as const;
const RESULT_BARS = [28, 34, 30, 41, 38, 47, 52, 49, 58, 64] as const;

function SampleHeader({ label }: Readonly<{ label: string }>) {
  const t = useTranslations("challengeReport.intro");
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="min-w-0 truncate text-ui-caption font-semibold text-fg">{label}</span>
      <PillBadge>{t("sample")}</PillBadge>
    </div>
  );
}

function BaselineVisual() {
  const t = useTranslations("challengeReport");
  const format = useFormatter();
  return (
    <div className="grid gap-3">
      <SampleHeader label={t("dayOne")} />
      <dl className="m-0 grid grid-cols-2 gap-3">
        {[
          { label: t("intro.samplePages"), value: 48 },
          { label: t("intro.sampleClicks"), value: 1240 },
        ].map((fact) => (
          <div className="grid min-w-0 gap-0.5" key={fact.label}>
            <dt className="text-ui-micro text-fg-muted">{fact.label}</dt>
            <dd className="m-0 text-ui-section tabular-nums">{format.number(fact.value)}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function HabitVisual() {
  const t = useTranslations("challengeReport.intro");
  const calendar = useTranslations("challengeReport.calendar");
  const legend = [
    { className: "bg-green", label: t("legendChecked") },
    { className: "bg-meter-track", label: t("legendMissed") },
    { className: "border border-border", label: t("legendUpcoming") },
  ];
  return (
    <div className="grid gap-3">
      <SampleHeader label={calendar("label")} />
      <div className="grid grid-cols-10 gap-1">
        {Array.from({ length: 30 }, (_, index) => {
          const kind = HABIT[index];
          return (
            <span
              className={cn(
                "h-3 rounded-control",
                kind === "c"
                  ? "bg-green"
                  : kind === "m"
                    ? "bg-meter-track"
                    : "border border-border",
              )}
              key={index}
            />
          );
        })}
      </div>
      <ul className="m-0 flex list-none flex-wrap gap-x-3 gap-y-1 p-0">
        {legend.map((item) => (
          <li
            className="inline-flex items-center gap-1.5 text-ui-micro text-fg-muted"
            key={item.label}
          >
            <span className={cn("size-2.5 rounded-full", item.className)} />
            {item.label}
          </li>
        ))}
      </ul>
    </div>
  );
}

function ResultVisual() {
  const t = useTranslations("challengeReport");
  return (
    <div className="grid gap-3">
      <SampleHeader label={t("share.dayOf", { current: 30, total: 30 })} />
      <div className="flex h-14 items-end gap-1">
        {RESULT_BARS.map((height) => (
          <span
            className="min-w-0 flex-1 rounded-t-control bg-accent"
            key={height}
            style={{ height: `${height + 30}%` }}
          />
        ))}
      </div>
      <span className="text-ui-micro text-fg-muted">{t("intro.sampleResult")}</span>
    </div>
  );
}

/** The three mechanics steps of the introduction, each with a sample visual. */
export function useChallengeIntroSteps(): IntroductionStep[] {
  const t = useTranslations("challengeReport.intro");
  return [
    { description: t("startBody"), title: t("startTitle"), visual: <BaselineVisual /> },
    { description: t("workBody"), title: t("workTitle"), visual: <HabitVisual /> },
    { description: t("finishBody"), title: t("finishTitle"), visual: <ResultVisual /> },
  ];
}
