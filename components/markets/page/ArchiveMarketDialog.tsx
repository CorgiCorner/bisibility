"use client";

import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import type { MarketsPageRow } from "@/lib/markets/page-model";
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
      setError("Market could not be archived. Try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Modal
      footer={
        <>
          <Button disabled={pending} onClick={onClose} size="sm" variant="ghost">
            Cancel
          </Button>
          <Button loading={pending} onClick={() => void confirm()} size="sm" variant="destructive">
            Archive market
          </Button>
        </>
      }
      onClose={onClose}
      open={market !== null}
      size="sm"
      title={market ? `Archive ${market.name}?` : "Archive market"}
    >
      <p className="m-0 text-[13px] leading-[1.55] text-fg-muted">
        {market
          ? `${market.name} will be archived.${market.activeKeywordCount > 0 ? ` Tracking for ${market.activeKeywordCount} ${market.activeKeywordCount === 1 ? "keyword" : "keywords"} will stop.` : ""} Existing rank history stays readable.`
          : null}
      </p>
      {error ? <p className="m-0 mt-3 text-[12px] text-red-text">{error}</p> : null}
    </Modal>
  );
}
