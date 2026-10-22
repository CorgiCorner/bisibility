"use client";
import type { Figure, ProviderAllocationRow } from "@usagekit/views";
import type { ProviderAllocationLabels } from "./provider-allocation-policy";
import { usageMotion } from "./usage-motion";
export function AllocationCurrentEvidence({
  evidence,
  labels,
  display,
}: {
  evidence: ProviderAllocationRow;
  labels: ProviderAllocationLabels;
  display: (value: Figure) => string;
}) {
  return (
    <dl className="rounded-lg bg-bg-sunken p-4 text-sm grid min-w-0 grid-cols-2 gap-3 sm:grid-cols-3">
      {[
        [labels.used, evidence.used],
        [labels.reserved, evidence.reserved],
        [labels.remaining, evidence.remaining],
      ].map(([label, value]) => (
        <div key={label as string} className="min-w-0">
          <dt className="break-words text-xs text-fg-muted">{label as string}</dt>
          <dd
            key={display(value as Figure)}
            className={`mt-0.5 break-words font-medium tabular-nums ${usageMotion.enter}`}
          >
            {display(value as Figure)}
          </dd>
        </div>
      ))}
    </dl>
  );
}
