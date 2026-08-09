"use client";

import { formatEstimateCents } from "@/lib/cost-estimate/project-estimate";
import { LinkIcon as Link } from "@phosphor-icons/react";

type SuggestedTarget = {
  kind: "competitor" | "project";
  target: string;
};

type BacklinksIdleStateProps = {
  estimateCents: number | null;
  onSelectTarget: (target: string) => void;
  suggestions: SuggestedTarget[];
};

const bullets = [
  "Runs on your own DataForSEO key, price shown before every run",
  "Snapshots cached for 24 hours - reopening and re-slicing is free",
  "Every refresh diffs against the last snapshot: new and lost links flagged",
] as const;

function estimateFootnote(estimateCents: number | null) {
  if (estimateCents == null) return "Price unavailable, cached for a day once run";
  return `~${formatEstimateCents(estimateCents)} each, cached for a day once run`;
}

export function BacklinksIdleState({
  estimateCents,
  onSelectTarget,
  suggestions,
}: Readonly<BacklinksIdleStateProps>) {
  return (
    <section
      aria-label="Backlinks introduction"
      className="flex min-h-[420px] flex-col items-center justify-center gap-[18px] px-4 py-12 text-center"
    >
      <div className="grid size-16 place-items-center rounded-full bg-bg-sunken text-fg-muted">
        <Link aria-hidden size={28} />
      </div>
      <h2 className="m-0 text-[19px] font-semibold tracking-[-0.01em]">Point it at any domain</h2>
      <ul className="m-0 grid list-none gap-2.5 p-0 text-left">
        {bullets.map((bullet) => (
          <li className="flex items-center gap-2.5 text-[14px] text-fg-muted" key={bullet}>
            <span aria-hidden className="size-[5px] shrink-0 rounded-full bg-accent" />
            {bullet}
          </li>
        ))}
      </ul>
      {suggestions.length > 0 ? (
        <div className="mt-2 flex flex-col items-center gap-2.5">
          <p className="m-0 font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-fg-muted">
            Start with sites you already watch
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            {suggestions.map((suggestion) => (
              <button
                className="inline-flex items-center gap-2 rounded-full border border-border-strong bg-bg-elev px-3.5 py-1.5 text-[13px] font-medium transition-colors hover:border-accent hover:text-accent-text focus-visible:border-accent focus-visible:text-accent-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-solid"
                key={`${suggestion.kind}:${suggestion.target}`}
                onClick={() => onSelectTarget(suggestion.target)}
                type="button"
              >
                {suggestion.target}
                <span className="text-[11px] font-normal text-fg-muted">
                  {suggestion.kind === "project" ? "this project" : "competitor"}
                </span>
              </button>
            ))}
          </div>
          <p className="m-0 text-[12px] text-fg-muted">{estimateFootnote(estimateCents)}</p>
        </div>
      ) : null}
    </section>
  );
}
