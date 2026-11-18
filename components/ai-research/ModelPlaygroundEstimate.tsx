import { InfoTooltip } from "@/components/ui/InfoTooltip";
import { formatMeasuredPaymentAmount } from "@/lib/action-payment/format";
import type { ModelPlaygroundCopy } from "@/lib/model-playground/composer-copy";
import { sumForecasts } from "@/lib/model-playground/composer-quote";
import { modelProviderName } from "@/lib/model-playground/composer-state";
import type { ModelPlaygroundQuote } from "@/lib/model-playground/launch-service";
import type { ModelPlaygroundInput } from "@/lib/model-playground/types";
import { useLocale } from "next-intl";

export function ModelPlaygroundEstimate({
  quote,
  input,
  failed,
  copy,
}: Readonly<{
  quote: ModelPlaygroundQuote | null;
  input: ModelPlaygroundInput;
  failed: boolean;
  copy: ModelPlaygroundCopy;
}>) {
  const locale = useLocale();
  // Reuse the exact decimal currency renderer; the leading tilde marks this as a forecast.
  const money = (amount: string, currency: string) =>
    `~${formatMeasuredPaymentAmount({ value: amount, unit: { kind: "currency", code: currency }, certainty: "measured" }, locale)}`;
  if (!quote)
    return (
      <p className="m-0 text-ui-caption text-fg-muted" role="status">
        {failed ? copy.estimateUnavailable : copy.estimating}
      </p>
    );
  const total = sumForecasts(quote.forecasts);
  const single = input.columns.length === 1 ? input.columns[0] : null;
  return (
    <div
      className="grid min-w-0 gap-1 text-ui-caption text-fg-muted"
      role="status"
      aria-live="polite"
      aria-label={copy.estimate}
    >
      <p
        className="m-0 flex flex-wrap items-center gap-1 font-medium text-fg"
        data-estimate-column={single?.columnId}
      >
        {total !== null
          ? `${copy.estimate}: ${money(total, quote.forecasts[0].money.currency)}`
          : single
            ? copy.unknownCost
            : copy.incompleteEstimate}
        {single
          ? ` · ${single.payment.fundingSource === "platform" ? copy.fundingCredits : copy.fundingOwnKey}`
          : null}
        <InfoTooltip text={`${copy.spendNotice} ${copy.rateBasis}`} size="label" />
      </p>
      {!single &&
        input.columns.map((column) => {
          const forecast = quote.forecasts.find((item) => item.columnId === column.columnId);
          const amount = forecast ? sumForecasts([forecast]) : null;
          return (
            <p
              className="m-0 min-w-0 break-words"
              key={column.columnId}
              data-estimate-column={column.columnId}
            >
              {input.columns.length > 1
                ? `${column.modelId} · ${modelProviderName(column.providerId)} · `
                : ""}
              {column.payment.fundingSource === "platform"
                ? copy.fundingCredits
                : copy.fundingOwnKey}
              :{" "}
              {amount === null || !forecast
                ? copy.unknownCost
                : money(amount, forecast.money.currency)}
            </p>
          );
        })}
    </div>
  );
}
