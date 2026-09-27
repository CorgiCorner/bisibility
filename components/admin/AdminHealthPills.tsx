"use client";

import { statusLabel } from "@/components/admin/AdminPrimitives";
import { ExternalLink } from "@/components/ui/ExternalLink";
import { Tooltip } from "@/components/ui/Tooltip";
import {
  type HealthTone,
  healthToneForRate,
  type ProviderHealthRow,
} from "@/lib/ops/instance-admin-health";
import { DOCS_URL } from "@/lib/site/site";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

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

const WORKER_DOCS = `${DOCS_URL}/self-hosting/temporal#scheduled-rank-checks`;

function HealthPill({
  hint,
  label,
  tone,
}: Readonly<{ hint?: ReactNode; label: string; tone: HealthTone }>) {
  const pill = (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold ${toneClasses[tone]}`}
      data-tone={tone}
    >
      <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${dotClasses[tone]}`} />
      {label}
    </span>
  );
  if (!hint) return pill;
  return (
    <Tooltip content={hint} interactive placement="bottom" semantics="description">
      {pill}
    </Tooltip>
  );
}

function WorkerUnknownHint() {
  const t = useTranslations("instanceAdmin.shellHealth");
  return (
    <span className="block max-w-[240px] py-0.5 text-left font-medium">
      {t("workerUnknownHint")}{" "}
      <ExternalLink className="font-semibold text-inherit underline" href={WORKER_DOCS}>
        {t("workerUnknownDocs")}
      </ExternalLink>
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
  const t = useTranslations("instanceAdmin.shellHealth");
  const adminT = useTranslations("instanceAdmin");
  const worst = compact ? worstProvider(providerHealth) : null;
  const providers: readonly ProviderHealthRow[] = compact
    ? worst === null
      ? []
      : [worst]
    : providerHealth;

  return (
    <div aria-label={t("label")} className="flex flex-wrap items-center gap-1.5">
      <HealthPill
        hint={workerStatus === "unknown" ? <WorkerUnknownHint /> : undefined}
        label={t("worker", { status: statusLabel(workerStatus, adminT) })}
        tone={workerStatus}
      />
      <HealthPill
        label={
          checkFailureRatePercent === null
            ? t("checksUnknown")
            : t("checks", { value: checkFailureRatePercent })
        }
        tone={healthToneForRate(checkFailureRatePercent)}
      />
      {providers.map((provider) => (
        <HealthPill
          key={provider.provider}
          label={
            provider.failureRatePercent === null
              ? t("providerUnknown", { provider: provider.provider })
              : t("provider", { provider: provider.provider, value: provider.failureRatePercent })
          }
          tone={healthToneForRate(provider.failureRatePercent)}
        />
      ))}
      <HealthPill
        label={
          undeliveredCount === null
            ? t("deliveryUnknown")
            : t("undelivered", { count: undeliveredCount })
        }
        tone={undeliveredCount === null ? "unknown" : undeliveredCount === 0 ? "ok" : "stale"}
      />
    </div>
  );
}
