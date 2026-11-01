"use client";
import { Button } from "@/components/ui/Button";
import { DataTable } from "@/components/ui/data-table/DataTable";
import type { DataTableColumn } from "@/components/ui/data-table/data-table-types";
import type { AffectedCheck, AffectedCheckPage } from "@/lib/integrations/provider-recovery/types";
import { useTranslations } from "next-intl";
import { type UIEvent, useMemo, useRef, useState } from "react";

export function AffectedChecksTable({
  initialPage,
  loadPage,
}: {
  initialPage: AffectedCheckPage;
  loadPage: (cursor: string) => Promise<AffectedCheckPage>;
}) {
  const t = useTranslations("projectIntegrations.recovery");
  const [page, setPage] = useState(initialPage);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const inFlight = useRef(false);
  const cursor = useRef(initialPage.nextCursor);
  const columns = useMemo<readonly DataTableColumn<AffectedCheck>[]>(
    () => [
      {
        id: "keyword",
        header: t("keyword"),
        accessorKey: "keyword",
        size: 290,
        minSize: 220,
        enableSorting: false,
        meta: { flex: 1, lockResize: true, lockVisible: true },
      },
      {
        id: "outcome",
        header: t("outcome"),
        cell: ({ row }) =>
          t(
            row.original.outcome === "completed"
              ? "completed"
              : row.original.outcome === "failed"
                ? "outcomeFailed"
                : row.original.outcome === "deferred"
                  ? "outcomeDeferred"
                  : "notCompleted",
          ),
        size: 170,
        minSize: 150,
        enableSorting: false,
        meta: { lockResize: true, lockVisible: true },
      },
      {
        id: "accounting",
        header: t("cost"),
        cell: ({ row }) =>
          t(
            row.original.accounting === "not_sent"
              ? "notSentCost"
              : row.original.accounting === "measured"
                ? "costRecorded"
                : "unknownCost",
          ),
        size: 210,
        minSize: 190,
        enableSorting: false,
        meta: { lockResize: true, lockVisible: true },
      },
    ],
    [t],
  );
  async function more() {
    if (inFlight.current || !cursor.current) return;
    const requestCursor = cursor.current;
    inFlight.current = true;
    setLoading(true);
    setError(false);
    try {
      const next = await loadPage(requestCursor);
      if (next.nextCursor === requestCursor)
        throw new Error("Affected-check cursor did not advance.");
      cursor.current = next.nextCursor;
      setPage((current) => {
        const ids = new Set(current.rows.map((row) => row.id));
        return { ...next, rows: [...current.rows, ...next.rows.filter((row) => !ids.has(row.id))] };
      });
    } catch {
      setError(true);
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  }
  function scroll(event: UIEvent<HTMLElement>) {
    const target = event.target;
    if (
      target instanceof HTMLElement &&
      target.getAttribute("role") === "table" &&
      !error &&
      target.scrollHeight - target.scrollTop - target.clientHeight < 300
    )
      void more();
  }
  return (
    <div>
      <p className="m-0 mb-3 text-[12px] text-fg-muted">
        {t("loaded", { count: page.rows.length, total: page.total })}
      </p>
      <section
        aria-label={t("checks")}
        className="h-[440px] max-h-[60dvh] min-h-[240px]"
        onScrollCapture={scroll}
      >
        <DataTable
          ariaLabel={t("checks")}
          bordered={false}
          columns={columns}
          density="compact"
          id="connection-affected-checks"
          layout="fill"
          onSortingChange={() => undefined}
          pagination={null}
          rows={page.rows}
          sorting={null}
          tabIndex={0}
        />
      </section>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <p aria-live="polite" role="status" className="m-0 text-[12px] text-fg-muted">
          {t(
            error
              ? "loadFailed"
              : loading
                ? "loading"
                : page.nextCursor
                  ? "scrollMore"
                  : "allLoaded",
          )}
        </p>
        {page.nextCursor ? (
          <Button disabled={loading} onClick={() => void more()} size="sm" variant="outline">
            {t(error ? "retry" : "loadMore")}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
