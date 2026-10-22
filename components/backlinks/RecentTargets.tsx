"use client";

import { PaymentChargeLine } from "@/components/action-payment/PaymentChargeLine";
import { usePaymentAmountFormatter } from "@/components/action-payment/use-payment-amount-formatter";
import { relativePastFact } from "@/lib/format/relative-time";
import { PROVIDER_CATALOG } from "@/lib/providers/catalog-metadata";
import { wholeSecondsRemaining } from "@/lib/ui/format-duration";
import { useFormatDuration } from "@/lib/ui/use-format-duration";
import { ClockCounterClockwiseIcon as Recent } from "@phosphor-icons/react/dist/csr/ClockCounterClockwise";
import { XIcon as X } from "@phosphor-icons/react/dist/csr/X";
import { useTranslations } from "next-intl";
import {
  type RecentBacklinksTarget,
  recentTargetKey,
  scopeLabel,
} from "./backlinks-workspace-model";

type RecentTargetsProps = {
  onOpen: (target: RecentBacklinksTarget) => void;
  onRemove: (target: RecentBacklinksTarget) => void;
  targets: RecentBacklinksTarget[];
};

function relativePastLabel(
  date: Date,
  now: Date,
  t: ReturnType<typeof useTranslations<"projectBacklinks.workspace.snapshot">>,
) {
  const fact = relativePastFact(date, now);
  if (fact.kind === "justNow") return t("relative.justNow");
  if (fact.kind === "yesterday") return t("relative.yesterday");
  if (fact.kind === "minutesAgo") return t("relative.minutesAgo", { count: fact.count });
  if (fact.kind === "hoursAgo") return t("relative.hoursAgo", { count: fact.count });
  return t("relative.daysAgo", { count: fact.count });
}

export function RecentTargets({ onOpen, onRemove, targets }: Readonly<RecentTargetsProps>) {
  const presentAmount = usePaymentAmountFormatter();
  const tSnapshot = useTranslations("projectBacklinks.workspace.snapshot");
  const t = useTranslations("projectBacklinks.workspace.recent");
  const formatDuration = useFormatDuration();
  if (targets.length === 0) return null;
  const now = new Date();

  return (
    <section aria-label={tSnapshot("recentTargetsAria")}>
      <div className="mb-2 flex items-center gap-1.5 font-sans tabular-nums text-[10px] font-semibold uppercase tracking-[0.5px] text-fg-muted">
        <Recent weight="regular" aria-hidden size={13} />
        {tSnapshot("recentTargets")}
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {targets.map((target) => {
          const payment =
            target.originalPayment ??
            (target.payment?.state !== "free" ? target.payment : undefined);
          return (
            <div
              className="flex shrink-0 items-center gap-2 rounded-full border border-border-control bg-bg-elev px-3 py-1.5 transition-colors hover:border-accent"
              key={recentTargetKey(target)}
            >
              <button
                className="flex items-center gap-2 text-left transition-colors"
                onClick={() => onOpen(target)}
                type="button"
              >
                <strong className="max-w-[180px] truncate text-[12px] font-semibold">
                  {target.target}
                </strong>
                <span className="font-sans tabular-nums text-[10px] text-fg-muted">
                  {target.provider
                    ? `${target.provider === "unknown" ? tSnapshot("unknownSource") : (PROVIDER_CATALOG.find((entry) => entry.id === target.provider)?.label ?? target.provider)} · `
                    : null}
                  {scopeLabel(target.targetScope)} -{" "}
                  {relativePastLabel(new Date(target.fetchedAt), now, tSnapshot)}
                </span>
                <PaymentChargeLine
                  original
                  payment={payment}
                  presented={payment ? presentAmount(payment.charge) : undefined}
                />
                <span className="rounded-full bg-accent-soft px-2 py-0.5 font-sans tabular-nums text-[9.5px] text-accent-text">
                  {wholeSecondsRemaining(target.cachedUntil, now) > 0
                    ? t("cached", {
                        duration: formatDuration(wholeSecondsRemaining(target.cachedUntil, now)),
                      })
                    : t("expired")}
                </span>
              </button>
              <button
                aria-label={tSnapshot("removeRecent", { target: target.target })}
                className="grid h-5 w-5 shrink-0 place-items-center rounded-full text-fg-muted transition-colors hover:text-fg"
                onClick={() => onRemove(target)}
                type="button"
              >
                <X aria-hidden size={12} weight="regular" />
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}
