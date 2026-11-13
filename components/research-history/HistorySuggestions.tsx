"use client";

import type { HistoryRow } from "@/lib/research-history/contract";
import { QueryClient, useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useState } from "react";
import type { HistoryAdapter } from "./history-adapter";

/** The three newest stored entries, anchored under an empty query field. */
export function HistorySuggestions({
  adapter,
  onOpen,
  open,
}: Readonly<{
  adapter: Pick<HistoryAdapter, "loadPage" | "renderMeta">;
  onOpen: (row: HistoryRow) => void;
  open: boolean;
}>) {
  const t = useTranslations("researchHistory");
  const [client] = useState(() => new QueryClient());
  const result = useQuery(
    {
      enabled: open,
      queryFn: () => adapter.loadPage({ cursor: null, filters: [], limit: 3, query: "" }),
      queryKey: ["research-history-suggestions"],
      retry: false,
    },
    client,
  );
  const rows = result.data?.groups.flatMap((group) => group.rows).slice(0, 3) ?? [];
  if (!open || result.isError || (!result.isPending && rows.length === 0)) return null;
  return (
    <div
      className="absolute top-full z-20 mt-1 w-full rounded-control border border-border bg-bg-elev p-1 shadow-lg"
      role="listbox"
    >
      <p className="m-0 px-2 py-1 text-ui-caption text-fg-muted">{t("suggestions")}</p>
      {result.isPending ? (
        <p className="m-0 px-2 py-2 text-ui-caption text-fg-muted" role="status">
          {t("loading")}
        </p>
      ) : (
        rows.map((row) => (
          <button
            className="grid w-full gap-0.5 rounded-control px-2 py-2 text-left outline-none hover:bg-bg-sunken focus-visible:bg-bg-sunken focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-accent-solid"
            key={row.key}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onOpen(row)}
            role="option"
            type="button"
          >
            <span className="truncate text-ui-body">{row.title}</span>
            <span className="truncate text-ui-caption text-fg-muted">
              {adapter.renderMeta(row)}
            </span>
          </button>
        ))
      )}
    </div>
  );
}
