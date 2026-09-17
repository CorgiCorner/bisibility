import type { CheckRunRow } from "@/lib/checks/contract";
import { ArrowRightIcon as ArrowRight } from "@phosphor-icons/react/dist/ssr/ArrowRight";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { CheckRunDetailsRow, splitCheckRunDetailLine } from "./CheckRunDetailsRow";
import type { CheckRunsTranslations } from "./check-runs-format";

type Props = {
  keywordHref: string;
  run: CheckRunRow;
};

type StoredResultLinesProps = Props & {
  t: CheckRunsTranslations;
};

export type CheckRunStoredResultLine = {
  content: ReactNode;
  id: string;
};

export function checkRunStoredResultLines({
  keywordHref,
  run,
  t,
}: Readonly<StoredResultLinesProps>): CheckRunStoredResultLine[] {
  const stored = run.storedResults;
  if (!stored || stored.tier === "none") return [];

  const depth = stored.requestedDepth;
  const retrieved = stored.tier === "full" ? stored.retrievedPositions : null;
  const showGap = retrieved != null && depth != null && retrieved < depth;
  const prefix = `${run.id}-stored-results`;
  const summary =
    stored.tier === "full"
      ? typeof run.position === "number"
        ? t("yourResult", { position: run.position })
        : depth != null
          ? t("notInTop", { depth })
          : t("notFoundAtCheck")
      : t("compactRecord");
  const lines: CheckRunStoredResultLine[] = [
    {
      content: (
        <CheckRunDetailsRow>
          <strong className="font-semibold text-fg">{t("retrievedResults")}</strong>
          {retrieved != null ? (
            <span>
              {depth != null
                ? t("retrievedOfDepth", { depth, retrieved })
                : t("retrieved", { retrieved })}
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
          <CheckRunDetailsRow>
            {t("positionsNotRetrieved", { end: depth, start: retrieved + 1 })}
          </CheckRunDetailsRow>
        ),
        id: `${prefix}-gap`,
      },
      ...splitCheckRunDetailLine(
        stored.stoppedAtResult ? t("stoppedAtResult") : t("positionsUnknown"),
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
          {t("openFullResults")}
          <ArrowRight aria-hidden size={11} weight="regular" />
        </Link>
      </CheckRunDetailsRow>
    ),
    id: `${prefix}-link`,
  });
  return lines;
}

export function CheckRunStoredResults({ keywordHref, run }: Readonly<Props>) {
  const t = useTranslations("projectRankTracker.checks");
  const lines = checkRunStoredResultLines({ keywordHref, run, t });
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
