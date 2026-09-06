"use client";

import { SpendBar } from "@/components/cost-estimate/SpendBar";
import { spendTone, spendToneTextClass } from "@/components/cost-estimate/spend-tone";
import { useDateFormat } from "@/components/dates/DateFormatProvider";
import { StatusPill } from "@/components/ui";
import { type DateFormat, formatDateRange } from "@/lib/dates/format";
import { formatMoneyCents } from "@/lib/format/money";
import { relativePast } from "@/lib/format/relative-time";
import type { ProviderSpendConnection } from "@/lib/queries/provider-spend";
import { metricEyebrowClassName } from "@/lib/ui/elevated-surface-styles";
import { CaretDownIcon as CaretDown } from "@phosphor-icons/react/dist/ssr";

function resetCopy(connection: ProviderSpendConnection, now: string, dateFormat: DateFormat) {
  if (connection.quotaReset === "none") return "does not expire";
  if (connection.quotaReset === "billing_cycle") return "resets at billing cycle";
  const next = new Date(
    Date.UTC(new Date(now).getUTCFullYear(), new Date(now).getUTCMonth() + 1, 1),
  );
  const key = next.toISOString().slice(0, 10);
  return `resets ${formatDateRange(key, key, dateFormat)}`;
}
function availability(connection: ProviderSpendConnection, now: string, dateFormat: DateFormat) {
  const value = connection.availableAtProvider;
  if (!value) return null;
  if (value.status === "reconnect_required") return "Reconnect required";
  if (value.status === "unreachable") return "Could not reach provider";
  const amount =
    value.unit === "usd"
      ? `Balance ${formatMoneyCents(value.amount * 100)}`
      : `${value.amount.toLocaleString("en-US")} left at provider`;
  return `${amount} (${relativePast(new Date(value.checkedAt), new Date(now))}) · ${resetCopy(connection, now, dateFormat)}`;
}
function allocationText(connection: ProviderSpendConnection) {
  if (!connection.allocation) return "0 of no budget";
  const used =
    connection.unit === "cents"
      ? formatMoneyCents(connection.used)
      : connection.used.toLocaleString("en-US");
  const allocation =
    connection.unit === "cents"
      ? formatMoneyCents(connection.allocation.amountPerMonth)
      : `${connection.allocation.amountPerMonth.toLocaleString("en-US")} searches`;
  return `${used} of ${allocation} used`;
}
function statusLabel(state: ProviderSpendConnection["state"]) {
  return state === "fallback_active"
    ? "fallback active"
    : state === "no_allocation"
      ? "no budget"
      : state.replaceAll("_", " ");
}

export function ProviderUsageRow({
  connection,
  now,
}: Readonly<{ connection: ProviderSpendConnection; now: string }>) {
  const dateFormat = useDateFormat();
  const percent = connection.usedPercent ?? 0;
  const tone = spendTone(percent, connection.allocation != null);
  const allocationToneClass = tone === "normal" ? "text-fg-muted" : spendToneTextClass[tone];
  return (
    <li className="border-t border-border first:border-t-0">
      <details className="group">
        <summary className="flex cursor-pointer list-none flex-wrap items-start gap-x-3 gap-y-2 py-3.5 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent-solid [&::-webkit-details-marker]:hidden">
          <span className="flex shrink-0 items-center gap-2 whitespace-nowrap">
            <span className="max-w-[180px] truncate text-[13.5px] font-semibold text-fg">
              {connection.provider}
            </span>
            {connection.primary ? (
              <StatusPill label="Primary" showDot={false} size="sm" status="optional" />
            ) : null}
          </span>
          <span className="ml-auto flex min-w-[9rem] flex-1 flex-wrap items-center justify-end gap-2 text-right">
            <span className="rounded-full border border-border bg-bg-sunken px-2 py-1 font-sans tabular-nums text-[9px] font-semibold uppercase text-fg-muted">
              {statusLabel(connection.state)}
            </span>
            <CaretDown
              aria-hidden
              className="shrink-0 text-fg-muted transition-transform group-open:rotate-180"
              size={14}
              weight="regular"
            />
          </span>
          <span className="basis-full">
            <span className="flex min-w-0 items-center gap-2">
              <SpendBar
                ariaLabel={`${connection.provider} budget used`}
                className="h-1 min-w-[72px] flex-1 overflow-hidden rounded-full"
                percent={percent}
                tone={tone}
              />
              <span
                className={`shrink-0 font-sans tabular-nums text-[11px] ${allocationToneClass}`}
              >
                {allocationText(connection)}
              </span>
            </span>
            {availability(connection, now, dateFormat) ? (
              <span className="mt-1 block font-sans tabular-nums text-[10px] text-fg-muted">
                {availability(connection, now, dateFormat)}
              </span>
            ) : null}
          </span>
        </summary>
        <div className="grid gap-4 border-t border-border bg-bg-sunken/40 px-3 py-3 sm:grid-cols-2">
          {connection.features.map((feature) => (
            <div key={feature.feature}>
              <span className={metricEyebrowClassName}>{feature.label}</span>
              <p className="m-0 mt-1 text-[13px] font-semibold text-fg tabular-nums">
                {feature.count.toLocaleString("en-US")}{" "}
                <span className="font-sans tabular-nums text-[11px] font-normal text-fg-muted">
                  · {formatMoneyCents(feature.costCents)}
                </span>
              </p>
            </div>
          ))}
        </div>
      </details>
    </li>
  );
}
