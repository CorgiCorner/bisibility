"use client";

import { PaymentChargeLine } from "@/components/action-payment/PaymentChargeLine";
import { usePaymentAmountFormatter } from "@/components/action-payment/use-payment-amount-formatter";
import type { RecentKeywordResearch } from "@/lib/keyword-research/recent-searches";
import { wholeSecondsRemaining } from "@/lib/ui/format-duration";
import { useFormatDuration } from "@/lib/ui/use-format-duration";
import { ClockCounterClockwiseIcon as Clock } from "@phosphor-icons/react/dist/csr/ClockCounterClockwise";
import { XIcon as X } from "@phosphor-icons/react/dist/csr/X";
import { useTranslations } from "next-intl";
import { researchRelativePast } from "./research-relative-time";

type RecentResearchSearchesProps = {
  disabled?: boolean;
  disabledHint?: string;
  onOpen: (search: RecentKeywordResearch) => void;
  onRemove: (search: RecentKeywordResearch) => void;
  searches: RecentKeywordResearch[];
};

function freeFor(
  value: string,
  now: Date,
  formatDuration: (seconds: number) => string,
  t: ReturnType<typeof useTranslations<"projectResearch.recent">>,
) {
  const seconds = wholeSecondsRemaining(value, now);
  return seconds > 0 ? t("freeFor", { duration: formatDuration(seconds) }) : t("expired");
}

export function RecentResearchSearches({
  disabled = false,
  disabledHint,
  onOpen,
  onRemove,
  searches,
}: Readonly<RecentResearchSearchesProps>) {
  const presentAmount = usePaymentAmountFormatter();
  const t = useTranslations("projectResearch.recent");
  const formatDuration = useFormatDuration();
  const searchT = useTranslations("projectResearch.search");
  const modeLabels = {
    auto: searchT("modeAuto"),
    related: searchT("modeRelated"),
    suggestions: searchT("modeSuggestions"),
    ideas: searchT("modeIdeas"),
  };
  const relativeTimeT = useTranslations("projectResearch.time");
  if (searches.length === 0) return null;
  const hintId = disabled && disabledHint ? "recent-research-disabled-hint" : undefined;
  const now = new Date();
  return (
    <section aria-label={t("section")}>
      <div className="mb-2 flex items-center gap-1.5 font-sans tabular-nums text-[10px] font-semibold uppercase tracking-[0.5px] text-fg-muted">
        <Clock weight="regular" size={13} /> {t("section")}
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {searches.map((search) => {
          const payment = search.originalPayment ?? search.payment;
          return (
            <div
              className="flex shrink-0 items-center gap-2 rounded-full border border-border-control bg-bg-elev px-3 py-1.5 transition-colors hover:border-accent"
              key={JSON.stringify([
                search.createdAt,
                search.seed,
                search.mode,
                search.connectionId,
                search.locationKey,
                search.resultLimit,
                search.includeClickstream,
              ])}
            >
              <button
                aria-describedby={hintId}
                className="flex items-center gap-2 text-left transition-colors disabled:cursor-not-allowed disabled:bg-bg-sunken disabled:text-fg-muted"
                disabled={disabled}
                onClick={() => onOpen(search)}
                type="button"
              >
                <strong className="max-w-[180px] truncate text-[12px] font-semibold">
                  {search.seed}
                </strong>
                <span className="rounded-control border border-border px-1.5 py-0.5 text-[10px] text-fg-muted">
                  {modeLabels[search.mode]}
                </span>
                <span className="font-sans tabular-nums text-[10px] text-fg-muted">
                  {search.scopeLabel} -{" "}
                  {researchRelativePast(new Date(search.createdAt), now, {
                    daysAgo: ({ count }) => relativeTimeT("daysAgo", { count }),
                    hoursAgo: ({ count }) => relativeTimeT("hoursAgo", { count }),
                    justNow: () => relativeTimeT("justNow"),
                    minutesAgo: ({ count }) => relativeTimeT("minutesAgo", { count }),
                    yesterday: () => relativeTimeT("yesterday"),
                  })}
                </span>
                <PaymentChargeLine
                  original={Boolean(
                    search.originalPayment || (search.payment && search.payment.state !== "free"),
                  )}
                  payment={payment}
                  presented={payment ? presentAmount(payment.charge) : undefined}
                />
                <span className="rounded-full bg-accent-soft px-2 py-0.5 font-sans tabular-nums text-[9.5px] text-accent-text">
                  {freeFor(search.cachedUntil, now, formatDuration, t)}
                </span>
              </button>
              <button
                aria-label={t("remove", { seed: search.seed })}
                className="grid h-5 w-5 shrink-0 place-items-center rounded-full text-fg-muted transition-colors hover:text-fg"
                onClick={() => onRemove(search)}
                type="button"
              >
                <X aria-hidden size={12} weight="regular" />
              </button>
            </div>
          );
        })}
      </div>
      {hintId ? (
        <p className="mb-0 mt-2 text-[11.5px] text-fg-muted" id={hintId}>
          {disabledHint}
        </p>
      ) : null}
    </section>
  );
}
