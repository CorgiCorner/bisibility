import type { KeywordDetailKeywordContext } from "@/lib/keyword-detail/state-model";
import type { KeywordRow } from "@/lib/queries/keywords";
import type { ReactNode } from "react";

type ContextChipProps = { children: ReactNode; label: string };

const unavailableCopy =
  "No search volume or difficulty data for this market - positions are tracked normally.";

function ContextChip({ children, label }: Readonly<ContextChipProps>) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-bg-sunken px-2.5 py-1">
      <span className="font-mono text-[9.5px] uppercase tracking-[0.5px] text-fg-muted">
        {label}
      </span>
      <span className="inline-flex items-baseline gap-1 text-[12px] font-semibold text-fg">
        {children}
      </span>
    </span>
  );
}

function formatVolume(volume: number) {
  return volume >= 1000
    ? `${(volume / 1000).toFixed(volume >= 10000 ? 0 : 1)}k/mo`
    : `${volume}/mo`;
}

function difficultyLabel(score: number) {
  if (score < 35) return "Easy";
  if (score < 65) return "Medium";
  return "Hard";
}

export function inferredKeywordContext(keyword: KeywordRow): KeywordDetailKeywordContext {
  const known = [
    keyword.volumeKnown !== false,
    keyword.cpcKnown !== false,
    keyword.difficultyKnown !== false,
  ];
  return known.every(Boolean) ? "full" : known.some(Boolean) ? "partial" : "unavailable";
}

export function KeywordContextRow({
  keyword,
}: Readonly<{ keyword: KeywordRow; state?: KeywordDetailKeywordContext }>) {
  const intent = keyword.intent ?? "Not set";
  const provenance = `${keyword.location.displayName} / ${keyword.location.languageLabel ?? keyword.location.hl}`;

  return (
    <section className="flex flex-wrap items-center gap-2.5 px-0.5">
      <p className="m-0 mr-1 font-mono text-[10px] uppercase tracking-[0.65px] text-fg-muted">
        Keyword context
      </p>
      <span title={keyword.volumeKnown === false ? unavailableCopy : undefined}>
        <ContextChip label="Volume">
          {keyword.volumeKnown === false ? "n/a" : formatVolume(keyword.volume)}
        </ContextChip>
      </span>
      <span title={keyword.cpcKnown === false ? unavailableCopy : undefined}>
        <ContextChip label="CPC">
          {keyword.cpcKnown === false ? "n/a" : `$${keyword.cpc}`}
        </ContextChip>
      </span>
      <span title={keyword.difficultyKnown === false ? unavailableCopy : undefined}>
        <ContextChip label="Difficulty">
          {keyword.difficultyKnown === false ? (
            "n/a"
          ) : (
            <>
              <span className="font-mono text-[11px] text-yellow-text">{keyword.difficulty}</span>
              {keyword.hasTag !== false ? (
                <span className="font-mono text-[9.5px] uppercase text-fg-muted">
                  {difficultyLabel(keyword.difficulty)}
                </span>
              ) : null}
            </>
          )}
        </ContextChip>
      </span>
      <ContextChip label="Intent">{intent}</ContextChip>
      <span className="font-mono text-[10.5px] text-fg-muted">for {provenance}</span>
    </section>
  );
}
