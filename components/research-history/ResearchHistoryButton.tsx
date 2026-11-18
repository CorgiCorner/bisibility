"use client";

import type { ButtonSize, ButtonVariant } from "@/components/ui/Button";
import { Button } from "@/components/ui/Button";
import { QueryClient, useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { HistoryDrawer, historyPageKey } from "./HistoryDrawer";
import type { HistoryAdapter } from "./history-adapter";

export function ResearchHistoryButton({
  adapter,
  disabled = false,
  size = "md",
  variant = "secondary",
}: Readonly<{
  adapter: HistoryAdapter;
  disabled?: boolean;
  size?: ButtonSize;
  variant?: ButtonVariant;
}>) {
  const t = useTranslations("researchHistory");
  const [open, setOpen] = useState(false);
  const [client] = useState(() => new QueryClient());
  const summary = useQuery(
    {
      queryFn: () => adapter.loadPage({ cursor: null, filters: [], query: "" }),
      queryKey: historyPageKey("", "[]"),
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
        variant={variant}
      >
        {t("title")}
        {typeof summary.data?.total === "number" ? (
          <span className="tabular-nums">
            {adapter.noun === "runs"
              ? t("runs", { count: summary.data.total })
              : t("checks", { count: summary.data.total })}
          </span>
        ) : null}
      </Button>
      <HistoryDrawer
        adapter={adapter}
        cache={client}
        onClose={() => setOpen(false)}
        open={open}
        summary={summary.data}
      />
    </>
  );
}
