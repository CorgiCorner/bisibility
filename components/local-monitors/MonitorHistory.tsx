"use client";

import { Button } from "@/components/ui/Button";
import type { MonitorHistoryPage } from "@/lib/local-monitors/contracts";
import { readMonitorHistoryAction } from "@/lib/local-monitors/session-actions";
import { useFormatter, useTranslations } from "next-intl";
import { useState } from "react";

export function MonitorHistory({ projectId, monitorId }: { projectId: string; monitorId: string }) {
  const t = useTranslations("shared.localMonitors");
  const format = useFormatter();
  const [page, setPage] = useState<MonitorHistoryPage | null>(null);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  async function load() {
    if (pending) return;
    setPending(true);
    setFailed(false);
    try {
      const next = await readMonitorHistoryAction(
        projectId,
        monitorId,
        page?.nextCursor ?? undefined,
      );
      setPage((old) => ({ ...next, items: old ? [...old.items, ...next.items] : next.items }));
    } catch {
      setFailed(true);
    } finally {
      setPending(false);
    }
  }
  return (
    <section className="space-y-3">
      <h2 className="font-semibold">{t("definitionHistory")}</h2>
      {page ? (
        <ol className="space-y-2">
          {page.items.map((row) => (
            <li key={row.id} className="rounded-control border border-border p-3 text-sm">
              {t("revisionNumber", { revision: format.number(row.revision) })} ·{" "}
              <time dateTime={new Date(row.createdAt).toISOString()}>
                {format.dateTime(new Date(row.createdAt), {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
              </time>
            </li>
          ))}
        </ol>
      ) : null}
      {!page || page.nextCursor ? (
        <Button variant="outline" disabled={pending} onClick={() => void load()}>
          {t(page ? "moreHistory" : "showHistory")}
        </Button>
      ) : null}
      {failed ? (
        <p role="alert" className="text-sm text-red-text">
          {t("readError")}
        </p>
      ) : null}
    </section>
  );
}
