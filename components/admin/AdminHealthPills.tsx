import {
  type HealthTone,
  healthToneForRate,
  type ProviderHealthRow,
} from "@/lib/ops/instance-admin-health";

const toneClasses: Record<HealthTone, string> = {
  failed: "bg-red/10 text-red-text",
  ok: "bg-green/10 text-green-text",
  stale: "bg-yellow/10 text-yellow-text",
  unknown: "bg-bg-sunken text-fg-muted",
};

const dotClasses: Record<HealthTone, string> = {
  failed: "bg-red",
  ok: "bg-green",
  stale: "bg-yellow",
  unknown: "bg-fg-muted",
};

function percentLabel(value: number | null): string {
  if (value === null) return "unknown";
  return `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(value)}% failed`;
}

function HealthPill({ label, tone }: Readonly<{ label: string; tone: HealthTone }>) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-mono text-[10px] font-bold ${toneClasses[tone]}`}
      data-tone={tone}
    >
      <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${dotClasses[tone]}`} />
      {label}
    </span>
  );
}

function worstProvider(rows: readonly ProviderHealthRow[]): ProviderHealthRow | null {
  return rows.reduce<ProviderHealthRow | null>((worst, row) => {
    if (worst === null) return row;
    if (row.failureRatePercent === null) return worst;
    if (worst.failureRatePercent === null) return row;
    return row.failureRatePercent > worst.failureRatePercent ? row : worst;
  }, null);
}

export type AdminHealthPillsProps = {
  checkFailureRatePercent: number | null;
  compact?: boolean;
  providerHealth: readonly ProviderHealthRow[];
  undeliveredCount: number | null;
  workerStatus: HealthTone;
};

export function AdminHealthPills({
  checkFailureRatePercent,
  compact = false,
  providerHealth,
  undeliveredCount,
  workerStatus,
}: Readonly<AdminHealthPillsProps>) {
  const worst = compact ? worstProvider(providerHealth) : null;
  const providers: readonly ProviderHealthRow[] = compact
    ? worst === null
      ? []
      : [worst]
    : providerHealth;

  return (
    <div aria-label="Operations health" className="flex flex-wrap items-center gap-1.5">
      <HealthPill label={`Worker ${workerStatus}`} tone={workerStatus} />
      <HealthPill
        label={`Checks: ${percentLabel(checkFailureRatePercent)}`}
        tone={healthToneForRate(checkFailureRatePercent)}
      />
      {providers.map((provider) => (
        <HealthPill
          key={provider.provider}
          label={`${provider.provider}: ${percentLabel(provider.failureRatePercent)}`}
          tone={healthToneForRate(provider.failureRatePercent)}
        />
      ))}
      <HealthPill
        label={
          undeliveredCount === null
            ? "Delivery: unknown"
            : `${new Intl.NumberFormat("en-US").format(undeliveredCount)} undelivered`
        }
        tone={undeliveredCount === null ? "unknown" : undeliveredCount === 0 ? "ok" : "stale"}
      />
    </div>
  );
}
