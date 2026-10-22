"use client";

import { PaymentChargeLine } from "@/components/action-payment/PaymentChargeLine";
import { usePaymentAmountFormatter } from "@/components/action-payment/use-payment-amount-formatter";
import type { DomainRecentTarget } from "@/lib/domain-overview/types";
import { wholeSecondsRemaining } from "@/lib/ui/format-duration";
import { useFormatDuration } from "@/lib/ui/use-format-duration";
import { ClockCounterClockwiseIcon as Clock } from "@phosphor-icons/react/dist/csr/ClockCounterClockwise";
import { useTranslations } from "next-intl";
import { relativePastLabel } from "./domain-overview-metrics";

type DomainOverviewRecentTargetsProps = {
  currentTarget?: string;
  onOpen: (target: DomainRecentTarget) => void;
  targets: DomainRecentTarget[];
};

function cacheLabel(
  target: DomainRecentTarget,
  now: Date,
  formatDuration: (seconds: number) => string,
  t: ReturnType<typeof useTranslations<"projectDomainOverview.workspace.ui">>,
) {
  const seconds = wholeSecondsRemaining(target.cachedUntil, now);
  return seconds > 0
    ? t("cacheAvailable", { duration: formatDuration(seconds) })
    : t("cacheExpired");
}

export function DomainOverviewRecentTargets({
  currentTarget,
  onOpen,
  targets,
}: Readonly<DomainOverviewRecentTargetsProps>) {
  const presentAmount = usePaymentAmountFormatter();
  const t = useTranslations("projectDomainOverview.workspace.ui");
  const formatDuration = useFormatDuration();
  const visible = targets.filter((target) => target.target !== currentTarget).slice(0, 5);
  if (visible.length === 0) return null;
  const now = new Date();

  return (
    <section aria-label={t("recentSearches")}>
      <div className="mb-2 flex items-center gap-1.5 font-sans tabular-nums text-[10px] font-semibold uppercase tracking-[0.5px] text-fg-muted">
        <Clock weight="regular" aria-hidden size={13} /> {t("recentSearches")}
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {visible.map((target) => (
          <button
            className="flex shrink-0 items-center gap-2 rounded-full border border-border-control bg-bg-elev px-3 py-1.5 text-left transition-colors hover:border-accent"
            key={`${target.target}:${target.scope}:${target.locationCode}:${target.languageCode}`}
            onClick={() => onOpen(target)}
            type="button"
          >
            <strong className="max-w-[180px] truncate text-[12px] font-semibold">
              {target.target}
            </strong>
            <span className="font-sans tabular-nums text-[10px] text-fg-muted">
              {target.scope === "subdomain" ? t("subdomain") : t("wholeDomain")} -{" "}
              {relativePastLabel(new Date(target.fetchedAt), now, t)}
            </span>
            <PaymentChargeLine
              original
              payment={target.originalPayment}
              presented={
                target.originalPayment ? presentAmount(target.originalPayment.charge) : undefined
              }
            />
            <span className="rounded-full bg-accent-soft px-2 py-0.5 font-sans tabular-nums text-[9.5px] text-accent-text">
              {cacheLabel(target, now, formatDuration, t)}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
