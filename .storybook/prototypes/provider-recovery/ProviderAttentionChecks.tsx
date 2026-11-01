"use client";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { StatusChip } from "@/components/ui/StatusChip";
import { ArrowLeftIcon } from "@phosphor-icons/react/dist/csr/ArrowLeft";
import { ClockIcon } from "@phosphor-icons/react/dist/csr/Clock";
import { ProviderAttentionCheckList } from "./ProviderAttentionCheckList";
import type { AttentionState } from "./provider-attention-copy";
import { checksLabel } from "./provider-attention-pages";

export function ProviderAttentionChecks({
  state,
  onBack,
  totalChecks,
  simulateLoadError,
}: {
  state: AttentionState;
  onBack: () => void;
  totalChecks: number;
  simulateLoadError?: boolean;
}) {
  const ready = state === "ready";
  return (
    <div>
      <Button
        className="mb-5"
        onClick={onBack}
        size="sm"
        startIcon={<ArrowLeftIcon aria-hidden size={14} />}
        variant="ghost"
      >
        Back to integration
      </Button>
      {ready ? (
        <Card className="flex items-start gap-3" size="lg">
          <ClockIcon aria-hidden className="mt-1 text-green-text" size={23} />
          <div>
            <h2 className="m-0 text-[15px] font-semibold">Next scheduled check</h2>
            <p className="mb-0 mt-2 text-[14px]">
              Tomorrow at 09:00 <span className="text-fg-muted">Europe/Warsaw</span>
            </p>
            <p className="mb-0 mt-1 text-[12.5px] text-fg-muted">
              Daily schedule · {checksLabel(totalChecks)} · DataForSEO
            </p>
          </div>
        </Card>
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-3 py-4">
            <div>
              <h2 className="m-0 text-[15px] font-semibold">
                {checksLabel(totalChecks)} {totalChecks === 1 ? "needs" : "need"} attention
              </h2>
              <p className="mb-0 mt-1 text-[12.5px] text-fg-muted">
                {state === "internal"
                  ? "We are reviewing a problem on our side."
                  : "One DataForSEO account issue affects these checks."}
              </p>
            </div>
            <StatusChip label="Monitoring paused" tone="attention" />
          </div>
          <ProviderAttentionCheckList
            key={`${totalChecks}:${simulateLoadError}`}
            simulateLoadError={simulateLoadError}
            state={state}
            totalChecks={totalChecks}
          />
          <p className="m-0 border-t border-border bg-bg-sunken px-3 py-3.5 text-[12px] leading-relaxed text-fg-muted">
            We will confirm the provider cost before these requests can be retried. Your existing
            schedule is saved.
          </p>
        </Card>
      )}
    </div>
  );
}
