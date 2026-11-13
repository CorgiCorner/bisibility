"use client";

import type { ButtonSize } from "@/components/ui/Button";
import { Button } from "@/components/ui/Button";
import { QueryClient, useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { HistoryDrawer } from "./HistoryDrawer";
import type { HistoryAdapter } from "./history-adapter";

export function ResearchHistoryButton({
  adapter,
  disabled = false,
  size = "md",
}: Readonly<{ adapter: HistoryAdapter; disabled?: boolean; size?: ButtonSize }>) {
  const t = useTranslations("researchHistory");
  const [open, setOpen] = useState(false);
  const [client] = useState(() => new QueryClient());
  const summary = useQuery(
    {
      queryFn: () => adapter.loadPage({ cursor: null, filters: [], query: "" }),
      queryKey: ["research-history-count", adapter.noun],
      retry: false,
    },
    client,
  );
  return (
    <>
      <Button
        disabled={disabled}
        onClick={() => setOpen(true)}
        size={size}
        type="button"
        variant="secondary"
      >
        {t("title")}
        {typeof summary.data?.total === "number" ? (
          <span className="tabular-nums">{t(adapter.noun, { count: summary.data.total })}</span>
        ) : null}
      </Button>
      <HistoryDrawer adapter={adapter} onClose={() => setOpen(false)} open={open} />
    </>
  );
}
