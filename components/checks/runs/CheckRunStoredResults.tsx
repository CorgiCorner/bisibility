import type { CheckRunRow } from "@/lib/checks/contract";
import { ArrowRightIcon as ArrowRight } from "@phosphor-icons/react/dist/ssr/ArrowRight";
import Link from "next/link";
import type { ReactNode } from "react";
import { CheckRunDetailsRow, splitCheckRunDetailLine } from "./CheckRunDetailsRow";

type Props = {
  keywordHref: string;
  run: CheckRunRow;
};

export type CheckRunStoredResultLine = {
  content: ReactNode;
  id: string;
};

export function checkRunStoredResultLines({
  keywordHref,
  run,
}: Readonly<Props>): CheckRunStoredResultLine[] {
  const stored = run.storedResults;
  if (!stored || stored.tier === "none") return [];

  const depth = stored.requestedDepth;
  const retrieved = stored.tier === "full" ? stored.retrievedPositions : null;
  const showGap = retrieved != null && depth != null && retrieved < depth;
  const prefix = `${run.id}-stored-results`;
  const summary =
    stored.tier === "full"
      ? typeof run.position === "number"
        ? `Your result at #${run.position}`
        : depth != null
          ? `Not in the top ${depth} at this check`
          : "Not found at this check"
      : "Compact record. One row per domain with its best position survived; titles, URLs and page features did not.";
  const lines: CheckRunStoredResultLine[] = [
    {
      content: (
        <CheckRunDetailsRow>
          <strong className="font-semibold text-fg">Retrieved results</strong>
          {retrieved != null ? (
            <span>
              {depth != null ? `${retrieved} of ${depth} retrieved` : `${retrieved} retrieved`}
            </span>
          ) : null}
        </CheckRunDetailsRow>
      ),
      id: `${prefix}-heading`,
    },
    ...splitCheckRunDetailLine(summary).map((line, index) => ({
      content: <CheckRunDetailsRow>{line}</CheckRunDetailsRow>,
      id: `${prefix}-summary-${index}`,
    })),
  ];

  if (showGap) {
    lines.push(
      {
        content: (
          <CheckRunDetailsRow>{`Positions ${retrieved + 1}-${depth} not retrieved`}</CheckRunDetailsRow>
        ),
        id: `${prefix}-gap`,
      },
      ...splitCheckRunDetailLine(
        stored.stoppedAtResult
          ? "The check stopped at your result, so these were never requested and never billed."
          : "These positions were not retrieved for this check. They are unknown, not empty.",
      ).map((line, index) => ({
        content: <CheckRunDetailsRow>{line}</CheckRunDetailsRow>,
        id: `${prefix}-gap-copy-${index}`,
      })),
    );
  }

  lines.push({
    content: (
      <CheckRunDetailsRow>
        <Link
          className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-accent-text hover:underline"
          href={keywordHref}
        >
          Open full results
          <ArrowRight aria-hidden size={11} weight="regular" />
        </Link>
      </CheckRunDetailsRow>
    ),
    id: `${prefix}-link`,
  });
  return lines;
}

export function CheckRunStoredResults(props: Readonly<Props>) {
  const lines = checkRunStoredResultLines(props);
  if (lines.length === 0) return null;
  return (
    <div className="mt-2 border-t border-border pt-2">
      {lines.map((line) => (
        <div className="mt-1" key={line.id}>
          {line.content}
        </div>
      ))}
    </div>
  );
}
