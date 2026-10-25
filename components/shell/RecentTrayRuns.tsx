"use client";
import { Button } from "@/components/ui/Button";
import { StatusChip } from "@/components/ui/StatusChip";
import { runStatusChipPresentation } from "@/components/ui/status-chip-mapping";
import { useLiveNow } from "@/components/ui/useLiveNow";
import type { OperationSnapshot } from "@/lib/rank-check/runs/contract";
import { projectRunRankCheckPath } from "@/lib/routing/project-runs-path";
import { CaretRightIcon } from "@phosphor-icons/react/dist/csr/CaretRight";
import { useFormatter, useTranslations } from "next-intl";

export function RecentTrayRuns({
  operations,
  projectRef,
  onDismiss,
  onError,
}: {
  operations: OperationSnapshot[];
  projectRef: string;
  onDismiss: (id: string) => Promise<void>;
  onError: () => void;
}) {
  const t = useTranslations("shell.operations.recent");
  const rank = useTranslations("shell.operations.rank");
  const format = useFormatter();
  const now = useLiveNow(new Date().toISOString(), true);
  return (
    <section aria-label={t("title")}>
      <h3 className="m-0 px-4 py-2 text-xs font-semibold text-fg-muted">{t("title")}</h3>
      {operations.map((operation) =>
        operation.kind === "rank_check" && operation.recent ? (
          <div className="border-b border-border px-4 py-3" key={operation.id}>
            <div className="flex items-center justify-between gap-2">
              <a
                className="flex min-w-0 flex-1 items-center justify-between gap-2 text-sm font-semibold text-fg hover:text-accent-text"
                href={projectRunRankCheckPath(projectRef, operation.id)}
              >
                <span>
                  {rank(`titles.${operation.trigger}`)} ·{" "}
                  {rank("keywordCount", { count: operation.keywordCount })}
                </span>
                <CaretRightIcon aria-hidden size={14} className="shrink-0" />
              </a>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => void onDismiss(operation.id).catch(onError)}
              >
                {t("dismiss")}
              </Button>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <StatusChip {...runStatusChipPresentation(operation.status, operation.outcome)} />
              {operation.finishedAt ? (
                <time dateTime={operation.finishedAt} className="text-xs text-fg-muted">
                  {format.relativeTime(new Date(operation.finishedAt), new Date(now))}
                </time>
              ) : null}
            </div>
            <p className="m-0 mt-1 text-xs tabular-nums text-fg-muted">
              {t("counts", {
                completed: operation.counts.completed,
                up: operation.recent.up,
                down: operation.recent.down,
                failed: operation.counts.failed,
              })}
            </p>
            {operation.recent.underReview > 0 ? (
              <p className="m-0 text-xs text-fg-muted">
                {t("underReview", { count: operation.recent.underReview })}
              </p>
            ) : null}
            {operation.recent.incidentHref ? (
              <a
                className="text-xs text-accent-text underline underline-offset-2"
                href={operation.recent.incidentHref}
              >
                {t("incident")}
              </a>
            ) : null}
          </div>
        ) : null,
      )}
    </section>
  );
}
