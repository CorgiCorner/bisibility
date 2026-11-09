"use client";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { useTranslations } from "next-intl";
import { type ReactNode, useState } from "react";
export function HistoryDetails({ children }: { children: ReactNode }) {
  const t = useTranslations("projectRankTracker.keywordDetail.recordedHistory");
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="xs" variant="ghost" onClick={() => setOpen(true)}>
        {t("detailToggle")}
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title={t("detailToggle")}>
        <div className="space-y-3 text-sm text-fg-muted [overflow-wrap:anywhere]">{children}</div>
      </Modal>
    </>
  );
}
