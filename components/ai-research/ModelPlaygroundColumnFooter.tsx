"use client";
import { Button } from "@/components/ui/Button";
import type { ResultColumn } from "@/lib/model-playground/result-view";
import type { ModelMoney } from "@/lib/model-playground/types";
import { useLocale, useTranslations } from "next-intl";
import { Fragment, useId, useState } from "react";
import "./ModelPlaygroundColumns.css";

const DECIMAL_LENGTH_CAP = 1000;
const PLAIN_DECIMAL = /^-?\d+(\.\d+)?$/;

function decimalExponent(text: string) {
  const match = /^([+-]?)(\d+)$/.exec(text);
  const digits = match?.[2]?.replace(/^0+/, "") || "0";
  // A shift of 10000 or more cannot fit the existing receipt length cap.
  if (!match || digits.length > 4) return null;
  let value = 0;
  for (const char of digits) value = value * 10 + (char.charCodeAt(0) - 48);
  return match[1] === "-" ? -value : value;
}

/** Expand exponent notation by moving digits, never by converting through a float. */
function plainDecimal(amount: string) {
  if (PLAIN_DECIMAL.test(amount)) return amount;
  const match = /^(-?)(\d+)(?:\.(\d+))?e([+-]?\d+)$/.exec(amount);
  if (!match) return null;
  const sign = match[1] ?? "";
  const whole = match[2] ?? "";
  const fraction = match[3] ?? "";
  const raw = `${whole}${fraction}`;
  if (/^0+$/.test(raw)) return `${sign}0`;
  const exponent = decimalExponent(match[4] ?? "");
  if (exponent === null) return null;
  const leadingZeros = raw.match(/^0*/)?.[0].length ?? 0;
  const digits = raw.slice(leadingZeros);
  const point = whole.length - leadingZeros + exponent;
  const length =
    sign.length +
    (point <= 0 ? 2 - point + digits.length : point >= digits.length ? point : digits.length + 1);
  if (length > DECIMAL_LENGTH_CAP) return null;
  const body =
    point <= 0
      ? `0.${"0".repeat(-point)}${digits}`
      : point >= digits.length
        ? `${digits}${"0".repeat(point - digits.length)}`
        : `${digits.slice(0, point)}.${digits.slice(point)}`;
  return `${sign}${body}`;
}

function moneyAmount(money: ModelMoney, locale: string) {
  if (
    money.certainty === "unknown" ||
    typeof money.amount !== "string" ||
    money.amount.length > DECIMAL_LENGTH_CAP
  )
    return null;
  const amount = plainDecimal(money.amount);
  if (!amount || amount.length > DECIMAL_LENGTH_CAP || !PLAIN_DECIMAL.test(amount)) return null;
  const [integer, fraction = ""] = amount.split(".");
  try {
    const whole = BigInt(integer);
    // Preserve receipt digits without floating-point rounding, including negative fractions.
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: money.currency,
      minimumFractionDigits: fraction ? 1 : 0,
      maximumFractionDigits: 1,
    })
      .formatToParts(whole === 0n && integer.startsWith("-") ? -0 : whole)
      .map((part) => (part.type === "fraction" ? fraction : part.value))
      .join("");
  } catch {
    return null;
  }
}
export function ModelPlaygroundColumnFooter({
  column,
  onFullAnswer,
}: Readonly<{ column: ResultColumn; onFullAnswer?: () => void }>) {
  const c = useTranslations("projectAiResearch.modelPlayground");
  const t = useTranslations("projectAiResearch");
  const locale = useLocale();
  const evidenceAmount = (value: ModelMoney) => {
    const amount = moneyAmount(value, locale);
    return amount === null
      ? c("costUnavailable")
      : c("moneyAmount", { amount, certainty: value.certainty });
  };
  const [expanded, setExpanded] = useState(false);
  const id = useId();
  const { money, scope } = column.cost;
  const amount = moneyAmount(money, locale);
  const usage = column.usage;
  const cacheTokens =
    usage?.inputCacheAccounting === "included"
      ? 0
      : usage?.inputCacheAccounting === "additional" &&
          usage.cacheReadInputTokens != null &&
          usage.cacheWriteInputTokens != null
        ? usage.cacheReadInputTokens + usage.cacheWriteInputTokens
        : null;
  const totalTokens =
    usage?.inputTokens != null && usage.outputTokens != null && cacheTokens !== null
      ? usage.inputTokens + usage.outputTokens + cacheTokens
      : null;
  const tokenText =
    totalTokens !== null && Number.isSafeInteger(totalTokens)
      ? c("tokens", { count: totalTokens })
      : c("tokensUnknown");
  const costText =
    amount === null
      ? c("costUnavailable")
      : c("costLine", {
          scope:
            scope?.kind === "subtotal" ? c("subtotal") : scope?.kind === "total" ? c("total") : "",
          amount,
          certainty: money.certainty,
          qualifier: c(money.certainty === "estimated" ? "estimatedUsage" : "reportedProvider"),
        }).trim();
  const values = [
    [
      t("modelPlayground.payWith"),
      t(
        column.fundingSource === "platform" ? "modelPlayground.credits" : "modelPlayground.yourKey",
      ),
    ],
    ...(column.actualProviderId || column.actualModelId
      ? [
          [
            c("actualRoute"),
            [column.actualProviderId, column.actualModelId].filter(Boolean).join(" / "),
          ],
        ]
      : []),
    [
      c("duration"),
      column.durationMs === null
        ? c("unreported")
        : c("seconds", { count: column.durationMs / 1000 }),
    ],
    [c("inputTokens"), usage?.inputTokens],
    [c("outputTokens"), usage?.outputTokens],
    [c("reasoningTokens"), usage?.reasoningTokens],
    [c("cacheRead"), usage?.cacheReadInputTokens],
    [c("cacheWrite"), usage?.cacheWriteInputTokens],
    [c("cacheAccounting"), usage?.inputCacheAccounting],
    [c("searchCalls"), usage?.searchCalls],
    [c("searchTokens"), usage?.searchContentTokens],
    [c("usageCompleteness"), usage?.completeness],
    ...(usage?.cacheWrites.map((write) => [
      c("cacheTtl", { count: write.ttlSeconds }),
      write.tokens,
    ]) ?? []),
    [c("basis"), money.basis],
    [c("rateCard"), money.rateCardVersion],
    ...(scope
      ? [
          [c("includes"), scope.includes.join(", ")],
          [c("excludes"), scope.excludes.join(", ")],
          [c("unknownComponents"), scope.unknown.join(", ")],
        ]
      : []),
    ...Object.entries(column.costEvidence?.upstreamInference ?? {}).map(([name, value]) => [
      `${c("upstreamInference")} (${name})`,
      value ? `${evidenceAmount(value)} · ${value.basis}` : null,
    ]),
    ...(column.costEvidence?.localEstimate
      ? [
          [
            c("localEstimate"),
            `${evidenceAmount(column.costEvidence.localEstimate)} · ${column.costEvidence.localEstimate.rateCardVersion}`,
          ],
        ]
      : []),
  ];
  const timing =
    column.durationMs === null
      ? column.observedAt?.slice(0, 16)
      : c("seconds", { count: column.durationMs / 1000 });
  return (
    <footer
      className="model-playground-footer gap-x-3 gap-y-2 pt-3 text-ui-caption text-fg-muted"
      data-column-footer
    >
      {onFullAnswer ? (
        <Button
          className="model-playground-disclosure justify-self-start"
          disabled={column.answer === null}
          onClick={onFullAnswer}
          size="sm"
          variant="outline"
        >
          {column.provenance || column.legacyExcerpt
            ? c("retainedAnswer")
            : t("modelPlayground.fullAnswer")}
        </Button>
      ) : null}
      {column.provenance ? (
        <p className="col-start-1 m-0" data-column-cost>
          {costText} · {tokenText}
        </p>
      ) : null}
      {timing ? <span className="col-start-2 tabular-nums justify-self-end">{timing}</span> : null}
      {column.provenance ? (
        <>
          {amount !== null && (!scope || scope.kind === "unknown") ? (
            <p className="col-span-full m-0">{c("scopeUnknown")}</p>
          ) : null}
          <Button
            aria-controls={id}
            aria-expanded={expanded}
            className="model-playground-disclosure col-span-full justify-self-start"
            onClick={() => setExpanded(!expanded)}
            size="sm"
            variant="outline"
          >
            {c("usageDetails")}
          </Button>
          <div hidden={!expanded} className="col-span-full" id={id}>
            {column.provenance === "api_response" ? (
              <p className="m-0">{c("apiResponse")}</p>
            ) : null}
            {column.resolvedWorkspaceId ? (
              <p className="m-0 break-all" data-observed-workspace>
                {t("modelPlayground.observedWorkspace", { workspace: column.resolvedWorkspaceId })}
              </p>
            ) : null}
            {column.allowedProviders ? (
              <p className="m-0 break-words" data-allowed-providers>
                {t("modelPlayground.allowedProviderSet", {
                  providers: column.allowedProviders.join(", "),
                })}
              </p>
            ) : null}
            <dl className="model-playground-metrics gap-x-3 gap-y-1">
              {values.map(([label, value], index) => (
                <Fragment key={`${label}-${index}`}>
                  <dt>{label}</dt>
                  <dd>{value ?? c("unreported")}</dd>
                </Fragment>
              ))}
            </dl>
          </div>
        </>
      ) : null}
    </footer>
  );
}
