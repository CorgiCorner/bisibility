"use client";

import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { formatMoneyCents } from "@/lib/format/money";
import type { MarketsPageRow } from "@/lib/markets/page-model";
import { useState } from "react";

type RestoreMarketDialogProps = {
  market: MarketsPageRow | null;
  onClose: () => void;
  onRestore: (market: MarketsPageRow) => Promise<void>;
};

export function RestoreMarketDialog({
  market,
  onClose,
  onRestore,
}: Readonly<RestoreMarketDialogProps>) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    if (!market || pending) return;
    setPending(true);
    setError(null);
    try {
      await onRestore(market);
      onClose();
    } catch {
      setError("Market could not be restored. Try again.");
    } finally {
      setPending(false);
    }
  }

  const cost = market?.monthlyCostCents == null ? "-" : formatMoneyCents(market.monthlyCostCents);
  return (
    <Modal
      footer={
        <>
          <Button disabled={pending} onClick={onClose} size="sm" variant="ghost">
            Cancel
          </Button>
          <Button loading={pending} onClick={() => void confirm()} size="sm">
            Restore market
          </Button>
        </>
      }
      onClose={onClose}
      open={market !== null}
      size="sm"
      title={market ? `Restore ${market.name}?` : "Restore market"}
    >
      <p className="m-0 text-[13px] leading-[1.55] text-fg-muted">
        {market
          ? `Restoring resumes ${market.keywordCount} keywords on their schedules - approx ${cost} a month.`
          : null}
      </p>
      {error ? <p className="m-0 mt-3 text-[12px] text-red-text">{error}</p> : null}
    </Modal>
  );
}
