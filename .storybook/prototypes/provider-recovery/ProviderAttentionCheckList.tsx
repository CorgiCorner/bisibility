"use client";

import { Button } from "@/components/ui/Button";
import { DataTable } from "@/components/ui/data-table/DataTable";
import type { DataTableColumn } from "@/components/ui/data-table/data-table-types";
import { Spinner } from "@/components/ui/Spinner";
import { type UIEvent, useMemo, useRef, useState } from "react";
import type { AttentionState } from "./provider-attention-copy";
import {
  type AttentionCheckRow,
  attentionCheckPage,
  attentionPageSize,
  checksLabel,
  formatCheckCount,
} from "./provider-attention-pages";

export function ProviderAttentionCheckList({
  state,
  totalChecks,
  simulateLoadError = false,
}: {
  state: AttentionState;
  totalChecks: number;
  simulateLoadError?: boolean;
}) {
  const [page, setPage] = useState(() => attentionCheckPage(totalChecks, null));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const inFlight = useRef(false);
  const cursor = useRef(page.nextCursor);
  const failNextPage = useRef(simulateLoadError);
  const columns = useMemo<readonly DataTableColumn<AttentionCheckRow>[]>(
    () => [
      {
        id: "keyword",
        header: "Keyword",
        accessorKey: "keyword",
        size: 320,
        minSize: 240,
        enableSorting: false,
        meta: { flex: 1, lockResize: true, lockVisible: true },
      },
      {
        id: "outcome",
        header: "Check outcome",
        cell: () => (state === "internal" ? "Could not start" : "Not completed"),
        size: 180,
        minSize: 150,
        enableSorting: false,
        meta: { lockResize: true, lockVisible: true },
      },
      {
        id: "cost",
        header: "Provider cost",
        cell: () => "Awaiting confirmation",
        size: 220,
        minSize: 190,
        enableSorting: false,
        meta: { lockResize: true, lockVisible: true },
      },
    ],
    [state],
  );

  async function loadMore() {
    if (inFlight.current || !cursor.current) return;
    const requestCursor = cursor.current;
    inFlight.current = true;
    setLoading(true);
    setError(false);
    try {
      // Storybook transport delay. Production would fetch this cursor from the application API.
      await new Promise((resolve) => setTimeout(resolve, 650));
      if (failNextPage.current) {
        failNextPage.current = false;
        setError(true);
        return;
      }
      const next = attentionCheckPage(totalChecks, requestCursor);
      cursor.current = next.nextCursor;
      setPage((current) => ({
        rows: [...current.rows, ...next.rows],
        nextCursor: next.nextCursor,
      }));
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  }

  function handleScroll(event: UIEvent<HTMLElement>) {
    const target = event.target;
    if (!(target instanceof HTMLElement) || target.getAttribute("role") !== "table") return;
    if (!error && target.scrollHeight - target.scrollTop - target.clientHeight < 300) {
      void loadMore();
    }
  }

  return (
    <div data-testid="attention-check-list">
      <p className="m-0 px-3 py-3 text-[12px] text-fg-muted">
        <span>
          {formatCheckCount(page.rows.length)} of {checksLabel(totalChecks)} loaded
        </span>
      </p>
      <section
        aria-label="Scrollable affected checks"
        className="h-[440px] max-h-[60dvh] min-h-[240px]"
        onScrollCapture={handleScroll}
      >
        <DataTable
          ariaLabel={`Affected checks: ${formatCheckCount(totalChecks)} total, ${page.rows.length} loaded`}
          bordered={false}
          columns={columns}
          density="compact"
          id="provider-attention-checks"
          layout="fill"
          onSortingChange={() => undefined}
          pagination={null}
          rows={page.rows}
          sorting={null}
          tabIndex={0}
        />
      </section>
      <div className="flex min-h-14 flex-wrap items-center justify-between gap-3 border-t border-border px-3 py-3">
        <p
          aria-live="polite"
          className={`m-0 flex items-center gap-2 text-[12px] ${error ? "text-fg" : "text-fg-muted"}`}
          role="status"
        >
          {loading ? <Spinner /> : null}
          {error
            ? "Could not load more checks. Your loaded checks are still available."
            : loading
              ? "Loading more checks…"
              : page.nextCursor
                ? "Scroll to load more checks."
                : `All ${checksLabel(totalChecks)} loaded.`}
        </p>
        {page.nextCursor ? (
          <Button disabled={loading} onClick={() => void loadMore()} size="sm" variant="outline">
            {error
              ? "Try again"
              : `Load next ${Math.min(attentionPageSize, totalChecks - page.rows.length)}`}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
