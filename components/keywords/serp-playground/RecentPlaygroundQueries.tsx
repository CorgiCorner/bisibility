"use client";
import { Button } from "@/components/ui/Button";
import type { ComparisonRun } from "@/lib/provider-comparison/types";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { PlaygroundHistoryDialog } from "./PlaygroundHistoryDialog";
import { PlaygroundSearchRow } from "./PlaygroundSearchRow";
export function RecentPlaygroundQueries({
  projectRef,
  history,
  busy,
  selectRun,
}: {
  projectRef: string;
  history: ComparisonRun[];
  busy: boolean;
  selectRun: (run: ComparisonRun) => void;
}) {
  const t = useTranslations("projectRankTracker.serpPlayground");
  const [open, setOpen] = useState(false);
  return (
    <>
      {history.length ? (
        <section aria-label={t("history")} className="min-w-0">
          <div className="mb-2 flex items-center justify-between gap-3">
            <h2 className="m-0 text-sm font-medium">{t("history")}</h2>
            <Button variant="outline" size="sm" disabled={busy} onClick={() => setOpen(true)}>
              {t("allHistory")}
            </Button>
          </div>
          <div className="-mx-3 grid min-w-0 gap-1">
            {history.slice(0, 3).map((item) => (
              <Button
                key={item.id}
                variant="ghost"
                disabled={busy}
                className="h-auto min-w-0 justify-start px-3 py-3 text-left"
                onClick={() => selectRun(item)}
              >
                <PlaygroundSearchRow run={item} />
              </Button>
            ))}
          </div>
          <PlaygroundHistoryDialog
            projectRef={projectRef}
            open={open}
            onClose={() => setOpen(false)}
            selectRun={selectRun}
          />
        </section>
      ) : null}
    </>
  );
}
