"use client";

import { Button, Card, Modal, SectionTitle } from "@/components/ui";
import type { ArchivedProjectMarketsView } from "@/lib/queries/project-markets";
import { actionErrorMessage } from "@/lib/ui/action-error";
import { useRouter } from "next/navigation";
import { useState } from "react";

export type RestoreMarketAction = (input: {
  marketId: string;
  projectId: string;
}) => Promise<unknown>;

type ArchivedMarket = ArchivedProjectMarketsView["markets"][number];

type ArchivedMarketsCardProps = {
  canEdit: boolean;
  markets: ArchivedProjectMarketsView;
  restoreMarket: RestoreMarketAction;
};

function marketLabel(market: ArchivedMarket) {
  return `${market.displayName} / ${market.languageLabel}`;
}

/** The consequence has to be on screen before the click, not in the audit log afterwards. */
function resumeCopy(market: ArchivedMarket) {
  const keywords = market.keywordCount === 1 ? "1 keyword" : `${market.keywordCount} keywords`;
  return `Restoring resumes checks for ${keywords} in this market and re-arms every alert rule scoped to it. Keywords archived on their own stay archived.`;
}

export function ArchivedMarketsCard({
  canEdit,
  markets,
  restoreMarket,
}: Readonly<ArchivedMarketsCardProps>) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [restoring, setRestoring] = useState<ArchivedMarket | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  async function restore() {
    if (!restoring) return;
    setError(null);
    setPendingId(restoring.id);
    try {
      await restoreMarket({ marketId: restoring.id, projectId: markets.projectId });
      setRestoring(null);
      router.refresh();
    } catch (cause) {
      setError(actionErrorMessage(cause, "Market could not be restored."));
    } finally {
      setPendingId(null);
    }
  }

  if (markets.markets.length === 0) return null;

  return (
    <Card className="max-w-[760px]" data-archived-markets-card="" size="lg">
      <SectionTitle>Archived markets</SectionTitle>
      <p className="m-0 mt-1 text-[12.5px] leading-[1.55] text-fg-muted">
        Archived markets stop being checked and keyword writes no longer reach them. Restoring one
        is a deliberate action because it resumes spend.
      </p>
      {error ? <p className="m-0 mt-4 text-[12px] text-red-text">{error}</p> : null}
      <ul className="m-0 mt-5 list-none divide-y divide-border border-y border-border p-0">
        {markets.markets.map((market) => (
          <li
            className="flex flex-wrap items-center gap-x-5 gap-y-3 px-1 py-4 opacity-60"
            key={market.id}
          >
            <div className="min-w-[190px] flex-1">
              <p className="m-0 text-[13px] font-semibold text-fg">{marketLabel(market)}</p>
              <p className="m-0 mt-1 text-[11.5px] text-fg-muted">
                {market.keywordCount === 1
                  ? "1 keyword would resume"
                  : `${market.keywordCount} keywords would resume`}
              </p>
            </div>
            <div className="ml-auto">
              <Button
                disabled={!canEdit || pendingId === market.id}
                onClick={() => setRestoring(market)}
                size="sm"
                variant="ghost"
              >
                Restore
              </Button>
            </div>
          </li>
        ))}
      </ul>
      <Modal
        footer={
          <>
            <Button
              disabled={pendingId != null}
              onClick={() => setRestoring(null)}
              size="sm"
              variant="ghost"
            >
              Cancel
            </Button>
            <Button loading={pendingId === restoring?.id} onClick={() => void restore()} size="sm">
              Restore market
            </Button>
          </>
        }
        onClose={() => setRestoring(null)}
        open={restoring != null}
        size="sm"
        title={restoring ? `Restore ${marketLabel(restoring)}?` : "Restore market"}
      >
        <p className="m-0 text-[13px] leading-[1.55] text-fg-muted">
          {restoring ? resumeCopy(restoring) : null}
        </p>
      </Modal>
    </Card>
  );
}
