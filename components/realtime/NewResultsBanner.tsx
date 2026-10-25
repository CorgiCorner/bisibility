"use client";

import { Button } from "@/components/ui/Button";
import { useTranslations } from "next-intl";
import type { RefObject } from "react";

export function NewResultsBanner({
  onShow,
  focusRef,
}: Readonly<{
  onShow: () => void;
  focusRef: RefObject<HTMLDivElement | null>;
}>) {
  const t = useTranslations("shared.realtime");
  return (
    <div className="flex items-center gap-2 border-b border-border bg-bg-sunken px-3 py-1 text-xs text-fg-muted">
      <span role="status">{t("newResults")}</span>
      <Button
        size="xs"
        variant="ghost"
        onClick={() => {
          onShow();
          focusRef.current?.focus({ preventScroll: true });
        }}
      >
        {t("show")}
      </Button>
    </div>
  );
}
