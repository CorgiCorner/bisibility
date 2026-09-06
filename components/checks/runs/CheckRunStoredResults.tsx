import type { CheckRunRow } from "@/lib/checks/contract";
import { ArrowRightIcon as ArrowRight } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";

type Props = {
  keywordHref: string;
  run: CheckRunRow;
};

export function CheckRunStoredResults({ keywordHref, run }: Readonly<Props>) {
  const stored = run.storedResults;
  if (!stored || stored.tier === "none") return null;

  const depth = stored.requestedDepth;
  // A compact record has no retrieved count, so it gets no counter rather than a zero
  // nobody measured.
  const retrieved = stored.tier === "full" ? stored.retrievedPositions : null;
  const showGap = retrieved != null && depth != null && retrieved < depth;

  return (
    <div className="mt-2 border-t border-border pt-2">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 font-sans tabular-nums text-[10.5px]">
        <strong className="font-semibold text-fg">Retrieved results</strong>
        {retrieved != null ? (
          <span className="text-fg-muted">
            {depth != null ? `${retrieved} of ${depth} retrieved` : `${retrieved} retrieved`}
          </span>
        ) : null}
      </div>
      {stored.tier === "full" ? (
        <p className="mt-1 font-sans tabular-nums text-[10.5px] text-fg-muted">
          {typeof run.position === "number"
            ? `Your result at #${run.position}`
            : depth != null
              ? `Not in the top ${depth} at this check`
              : "Not found at this check"}
        </p>
      ) : (
        <p className="mt-1 font-sans tabular-nums text-[10.5px] text-fg-muted">
          Compact record. One row per domain with its best position survived; titles, URLs and page
          features did not.
        </p>
      )}
      {showGap ? (
        <div className="mt-1 font-sans tabular-nums text-[10.5px] text-fg-muted">
          <p className="m-0">{`Positions ${retrieved + 1}-${depth} not retrieved`}</p>
          <p className="m-0">
            {stored.stoppedAtResult
              ? "The check stopped at your result, so these were never requested and never billed."
              : "These positions were not retrieved for this check. They are unknown, not empty."}
          </p>
        </div>
      ) : null}
      <Link
        className="mt-1 inline-flex items-center gap-1 text-[11.5px] font-semibold text-accent-text hover:underline"
        href={keywordHref}
      >
        Open full results
        <ArrowRight aria-hidden size={11} weight="regular" />
      </Link>
    </div>
  );
}
