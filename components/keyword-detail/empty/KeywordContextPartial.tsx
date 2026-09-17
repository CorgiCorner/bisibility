import {
  EmptyModuleCard,
  EmptyModuleLabel,
} from "@/components/keyword-detail/empty/empty-state-primitives";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

type Difficulty = {
  label: "Easy" | "Medium" | "Hard";
  score: number;
};

export type KeywordContextPartialProps = {
  cpc?: string;
  difficulty?: Difficulty;
  volume?: string;
};

type MetricPillProps = {
  children: ReactNode;
  label: string;
};

function MetricPill({ children, label }: Readonly<MetricPillProps>) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-bg-sunken px-2.5 py-1">
      <span className="font-sans tabular-nums text-[9.5px] uppercase tracking-[0.5px] text-fg-muted">
        {label}
      </span>
      <span className="text-[12px] font-semibold text-fg">{children}</span>
    </span>
  );
}

function difficultyColor(label: Difficulty["label"]) {
  if (label === "Easy") return "var(--green)";
  if (label === "Medium") return "var(--yellow)";
  return "var(--red)";
}

const difficultyMessage = {
  Easy: "easy",
  Medium: "medium",
  Hard: "hard",
} as const;

export function KeywordContextPartial({
  cpc,
  difficulty = { label: "Medium", score: 62 },
  volume = "18k/mo",
}: Readonly<KeywordContextPartialProps>) {
  const t = useTranslations("projectRankTracker.keywordDetail.empty");
  return (
    <EmptyModuleCard>
      <EmptyModuleLabel>{t("keywordContext")}</EmptyModuleLabel>
      <div aria-label={t("availableMetrics")} className="mt-3 flex flex-wrap gap-2">
        {volume ? <MetricPill label={t("volume")}>{volume}</MetricPill> : null}
        {difficulty ? (
          <MetricPill label={t("difficulty")}>
            <span className="inline-flex items-center gap-1.5">
              <span
                aria-hidden
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: difficultyColor(difficulty.label) }}
              />
              <span>{difficulty.score}</span>
              <span className="font-sans tabular-nums text-[9.5px] uppercase tracking-[0.4px] text-fg-muted">
                {t(difficultyMessage[difficulty.label])}
              </span>
            </span>
          </MetricPill>
        ) : null}
        {cpc ? <MetricPill label={t("cpc")}>{cpc}</MetricPill> : null}
      </div>
    </EmptyModuleCard>
  );
}
