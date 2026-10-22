"use client";

import { ActionPaymentOptionPicker } from "@/components/action-payment/ActionPaymentOptionPicker";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { InfoTooltip } from "@/components/ui/InfoTooltip";
import { InlineToken } from "@/components/ui/InlineToken";
import { compactInputTypographyClassName } from "@/components/ui/input-styles";
import { MenuSelect } from "@/components/ui/MenuSelect";
import { Switch } from "@/components/ui/Switch";
import type { ActionPaymentOption, ActionPaymentQuote } from "@/lib/action-payment/contract";
import { formatPaymentAmount } from "@/lib/action-payment/format";
import { zodResolver } from "@/lib/forms/zod-resolver";
import type { KeywordResearchMode } from "@/lib/keyword-research/types";
import type { ResearchScope } from "@/lib/research/scope";
import { MagnifyingGlassIcon as MagnifyingGlass } from "@phosphor-icons/react/dist/csr/MagnifyingGlass";
import { useLocale, useTranslations } from "next-intl";
import type { KeyboardEvent } from "react";
import { useId } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { ResearchScopePicker } from "./ResearchScopePicker";

const formSchema = z.object({ seed: z.string().trim().max(80) });
type FormValues = z.infer<typeof formSchema>;

export type ResearchEstimateView = {
  cached: boolean;
  costCents: number | null;
  loading: boolean;
  payments?: ActionPaymentQuote[];
  paymentOptions?: ActionPaymentOption[];
};

type ResearchSearchCardProps = {
  connectionId: string;
  connectionOptions: Array<{ label: string; value: string }>;
  disabled?: boolean;
  estimate: ResearchEstimateView;
  includeClickstream: boolean;
  lookupDisabled?: boolean;
  scope: ResearchScope;
  scopes: readonly ResearchScope[];
  mode: KeywordResearchMode;
  onConnectionChange: (value: string) => void;
  onPaymentOptionChange?: (option: ActionPaymentOption) => void;
  onIncludeClickstreamChange: (value: boolean) => void;
  onLimitChange: (value: 100 | 300 | 500) => void;
  onScopeChange: (scope: ResearchScope) => void;
  onModeChange: (value: KeywordResearchMode) => void;
  onSeedsChange: (seeds: string[]) => void;
  onSubmit: (seeds: string[], option?: ActionPaymentOption) => void;
  resultLimit: 100 | 300 | 500;
  researching: boolean;
  seeds: string[];
};

function researchButtonLabel(
  researching: boolean,
  estimate: ResearchEstimateView,
  locale: string,
  t: ReturnType<typeof useTranslations<"projectResearch.search">>,
) {
  const payments = estimate.loading ? [] : (estimate.payments ?? []);
  const cost =
    payments.length && !payments.every((quote) => quote.cache.state === "hit")
      ? payments.map((quote) => formatPaymentAmount(quote.charge, locale)).join(" + ")
      : "none";
  return t("button", {
    cached:
      payments.length && payments.every((quote) => quote.cache.state === "hit") ? "true" : "false",
    cost,
    researching: researching ? "true" : "false",
  });
}

export function ResearchSearchCard({
  disabled = false,
  estimate,
  includeClickstream,
  lookupDisabled = false,
  scope,
  scopes,
  mode,
  onIncludeClickstreamChange,
  onPaymentOptionChange,
  onLimitChange,
  onScopeChange,
  onModeChange,
  onSeedsChange,
  onSubmit,
  resultLimit,
  researching,
  seeds,
}: Readonly<ResearchSearchCardProps>) {
  const t = useTranslations("projectResearch.search");
  const locale = useLocale();
  const { getValues, handleSubmit, register, resetField, watch } = useForm<FormValues>({
    defaultValues: { seed: "" },
    resolver: zodResolver(formSchema),
  });

  const noSeedHintId = useId();
  const seedHelpId = useId();
  const modeOptions = [
    { label: t("modeAuto"), value: "auto" },
    { label: t("modeRelated"), value: "related" },
    { label: t("modeSuggestions"), value: "suggestions" },
    { label: t("modeIdeas"), value: "ideas" },
  ];
  const limitOptions = [100, 300, 500].map((value) => ({
    label: t("resultLimit", { count: value }),
    value: String(value),
  }));

  const typedSeed = watch("seed") ?? "";
  const hasSeed = seeds.length > 0 || typedSeed.trim().length > 0;
  const buttonEstimate = typedSeed.trim() ? { ...estimate, payments: [] } : estimate;

  function commitSeed() {
    const seed = getValues("seed").trim();
    if (!seed || seeds.length >= 5) return seeds;
    const next = [...seeds.filter((item) => item.toLowerCase() !== seed.toLowerCase()), seed];
    onSeedsChange(next);
    resetField("seed");
    return next;
  }

  function handleSeedKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      commitSeed();
    }
  }

  function submit() {
    if (lookupDisabled) return;
    const next = commitSeed();
    if (next.length === 0) return;
    onSubmit(next, estimate.loading ? undefined : estimate.payments?.[0]?.option);
    onSeedsChange([]);
    resetField("seed");
  }

  return (
    <Card className="min-w-0 w-full p-4 sm:p-5" size="md">
      <form className="grid gap-3" onSubmit={handleSubmit(submit)}>
        <div className="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-start">
          <div
            data-input-shell
            data-disabled={disabled || researching}
            className="flex min-h-[34px] flex-1 flex-wrap items-center gap-1.5 rounded-control border border-border-control bg-transparent px-2.5 py-0.5 focus-within:border-accent data-[disabled=true]:cursor-not-allowed data-[disabled=true]:bg-bg-sunken md:min-w-[240px]"
          >
            {seeds.map((seed) => (
              <InlineToken
                dismissLabel={t("removeSeed", { seed })}
                key={seed}
                onDismiss={() => onSeedsChange(seeds.filter((item) => item !== seed))}
                value={seed}
              />
            ))}
            <input
              data-input-inner
              {...register("seed")}
              aria-label={t("seedAria")}
              aria-describedby={seedHelpId}
              className={`${compactInputTypographyClassName} disabled:cursor-not-allowed disabled:text-fg-muted min-w-0 w-40 flex-1 bg-transparent px-1 font-medium text-fg outline-none`}
              disabled={disabled || researching || seeds.length >= 5}
              id="research-seed"
              onKeyDown={handleSeedKeyDown}
              placeholder={
                seeds.length === 0 ? t("seedPlaceholder") : t("additionalSeedPlaceholder")
              }
            />
          </div>
          <div className="md:w-[230px]">
            <ResearchScopePicker
              disabled={researching}
              onChange={onScopeChange}
              scopes={scopes}
              value={scope}
            />
          </div>
          <MenuSelect
            ariaLabel={t("resultsLimitAria")}
            onChange={(value) => onLimitChange(Number(value) as 100 | 300 | 500)}
            options={limitOptions}
            triggerClassName="justify-between md:w-[132px]"
            value={String(resultLimit)}
          />
          <MenuSelect
            ariaLabel={t("modeAria")}
            compact
            leadingLabel={t("modeLabel")}
            onChange={(value) => onModeChange(value as KeywordResearchMode)}
            pinCaret
            options={modeOptions}
            triggerClassName="md:w-auto md:min-w-[132px]"
            value={mode}
          />
        </div>

        <p id={seedHelpId} className="m-0 text-[11px] leading-4 text-fg-muted">
          {t("seedHelp")}
        </p>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="inline-flex items-center gap-1.5">
            <Switch
              checked={includeClickstream}
              className="border-0 bg-transparent px-0 py-0"
              label={t("clickstream")}
              labelClassName="font-normal"
              onChange={(event) => onIncludeClickstreamChange(event.target.checked)}
            />
            <InfoTooltip text={t("clickstreamHelp")} />
          </span>
          <div className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-4">
            {onPaymentOptionChange ? (
              <ActionPaymentOptionPicker
                options={estimate.paymentOptions ?? []}
                disabled={estimate.loading || researching}
                value={estimate.payments?.[0]?.option.id ?? ""}
                onChange={(id) => {
                  const option = estimate.paymentOptions?.find((item) => item.id === id);
                  if (option) onPaymentOptionChange(option);
                }}
              />
            ) : null}
            <span className="inline-flex" title={!hasSeed ? t("noSeedHint") : undefined}>
              <Button
                aria-describedby={!hasSeed ? noSeedHintId : undefined}
                disabled={disabled || lookupDisabled || researching || estimate.loading || !hasSeed}
                loading={researching}
                loadingLabel={researchButtonLabel(true, buttonEstimate, locale, t)}
                startIcon={<MagnifyingGlass size={15} weight="regular" />}
                style={{ minWidth: 216 }}
                type="submit"
              >
                {researchButtonLabel(false, buttonEstimate, locale, t)}
              </Button>
              {!hasSeed ? (
                <span className="sr-only" id={noSeedHintId}>
                  {t("noSeedHint")}
                </span>
              ) : null}
            </span>
          </div>
        </div>
      </form>
    </Card>
  );
}
