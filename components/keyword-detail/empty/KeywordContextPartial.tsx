import {
  EmptyModuleCard,
  EmptyModuleLabel,
} from "@/components/keyword-detail/empty/empty-state-primitives";
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
      <span className="font-mono text-[9.5px] uppercase tracking-[0.5px] text-fg-muted">
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

export function KeywordContextPartial({
  cpc,
  difficulty = { label: "Medium", score: 62 },
  volume = "18k/mo",
}: Readonly<KeywordContextPartialProps>) {
  return (
    <EmptyModuleCard>
      <EmptyModuleLabel>Keyword context</EmptyModuleLabel>
      <div aria-label="Available keyword metrics" className="mt-3 flex flex-wrap gap-2">
        {volume ? <MetricPill label="Volume">{volume}</MetricPill> : null}
        {difficulty ? (
          <MetricPill label="Difficulty">
            <span className="inline-flex items-center gap-1.5">
              <span
                aria-hidden
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: difficultyColor(difficulty.label) }}
              />
              <span>{difficulty.score}</span>
              <span className="font-mono text-[9.5px] uppercase tracking-[0.4px] text-fg-muted">
                {difficulty.label}
              </span>
            </span>
          </MetricPill>
        ) : null}
        {cpc ? <MetricPill label="CPC">{cpc}</MetricPill> : null}
      </div>
    </EmptyModuleCard>
  );
}
