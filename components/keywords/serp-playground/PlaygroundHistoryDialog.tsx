"use client";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { FieldLabel } from "@/components/ui/FieldLabel";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { readSerpPlaygroundAction } from "@/lib/actions/serp-playground";
import { readPlaygroundHistoryAction } from "@/lib/actions/serp-playground-history";
import type { ComparisonRun } from "@/lib/provider-comparison/types";
import { QueryClient, useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useDeferredValue, useState } from "react";
import { PlaygroundSearchRow } from "./PlaygroundSearchRow";

export function PlaygroundHistoryDialog({
  projectRef,
  open,
  onClose,
  selectRun,
}: {
  projectRef: string;
  open: boolean;
  onClose: () => void;
  selectRun: (run: ComparisonRun) => void;
}) {
  const t = useTranslations("projectRankTracker.serpPlayground");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [client] = useState(() => new QueryClient());
  const deferredQuery = useDeferredValue(query);
  const history = useQuery(
    {
      queryKey: ["playground-history", projectRef, deferredQuery, page],
      enabled: open,
      retry: false,
      queryFn: async () => {
        const result = await readPlaygroundHistoryAction({
          projectRef,
          query: deferredQuery,
          page,
        });
        if (!result.ok) throw new Error("History unavailable");
        return result.history;
      },
    },
    client,
  );
  const data = history.data;
  const loading = history.isFetching;
  const [failed, setFailed] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  async function choose(id: string) {
    setSelected(id);
    try {
      const result = await readSerpPlaygroundAction({ projectRef, runId: id });
      if (result.ok) {
        selectRun(result.run);
        onClose();
      } else setFailed(true);
    } catch {
      setFailed(true);
    } finally {
      setSelected(null);
    }
  }
  return (
    <Modal open={open} onClose={onClose} title={t("allHistory")} size="lg">
      <div className="grid min-w-0 gap-4">
        <div className="grid gap-1.5">
          <FieldLabel htmlFor="playground-history-search" label={t("searchHistory")} />
          <Input
            id="playground-history-search"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(0);
            }}
          />
        </div>
        {failed || history.isError ? (
          <p role="alert" className="m-0 text-sm text-fg-muted">
            {t("historyFailed")}
          </p>
        ) : null}
        <div className="max-h-[50dvh] min-h-40 overflow-auto" aria-busy={loading}>
          {loading ? (
            <p role="status" className="m-0 py-5 text-sm text-fg-muted">
              {t("historyLoading")}
            </p>
          ) : data?.entries.length ? (
            <ul className="m-0 grid list-none gap-1 p-0">
              {data.entries.map((item) => (
                <li key={item.id}>
                  <Button
                    variant="ghost"
                    disabled={selected !== null}
                    className="h-auto w-full min-w-0 justify-start px-3 py-3 text-left"
                    onClick={() => void choose(item.id)}
                  >
                    <PlaygroundSearchRow run={item} />
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState compact title={t("historyEmpty")} />
          )}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
          <span className="text-xs text-fg-muted">
            {data ? t("historyCount", { count: data.total }) : ""}
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={loading || page === 0}
              onClick={() => setPage((value) => value - 1)}
            >
              {t("previous")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={loading || !data || (page + 1) * data.pageSize >= data.total}
              onClick={() => setPage((value) => value + 1)}
            >
              {t("next")}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
