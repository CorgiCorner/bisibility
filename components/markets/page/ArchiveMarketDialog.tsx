"use client";

import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import type { MarketsPageRow } from "@/lib/markets/page-model";
import { useTranslations } from "next-intl";
import { useState } from "react";

type ArchiveMarketDialogProps = {
  market: MarketsPageRow | null;
  onArchive: (market: MarketsPageRow) => Promise<void>;
  onClose: () => void;
};

export function ArchiveMarketDialog({
  market,
  onArchive,
  onClose,
}: Readonly<ArchiveMarketDialogProps>) {
  const t = useTranslations("projectMarkets");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    if (!market || pending) return;
    setPending(true);
    setError(null);
    try {
      await onArchive(market);
      onClose();
    } catch {
      setError(t("archiveFailed"));
    } finally {
      setPending(false);
    }
  }

  return (
    <Modal
      footer={
        <>
          <Button disabled={pending} onClick={onClose} size="sm" variant="ghost">
            {t("cancel")}
          </Button>
          <Button loading={pending} onClick={() => void confirm()} size="sm" variant="destructive">
            {t("archive")}
          </Button>
        </>
      }
      onClose={onClose}
      open={market !== null}
      size="sm"
      title={t("archiveTitle", { market: market?.name ?? t("market") })}
    >
      <p className="m-0 text-[13px] leading-[1.55] text-fg-muted">
        {market
          ? t("archiveBody", { count: market.activeKeywordCount, market: market.name })
          : null}
      </p>
      {error ? <p className="m-0 mt-3 text-[12px] text-red-text">{error}</p> : null}
    </Modal>
  );
}
