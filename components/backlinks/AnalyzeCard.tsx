"use client";

import { ActionPaymentOptionPicker } from "@/components/action-payment/ActionPaymentOptionPicker";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { InfoTooltip } from "@/components/ui/InfoTooltip";
import { compactInputClassName } from "@/components/ui/input-styles";
import { MenuSelect } from "@/components/ui/MenuSelect";
import { quietChipVariants } from "@/components/ui/quiet-chip-styles";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Switch } from "@/components/ui/Switch";
import type { ActionPaymentOption } from "@/lib/action-payment/contract";
import { formatPaymentAmount } from "@/lib/action-payment/format";
import { zodResolver } from "@/lib/forms/zod-resolver";
import type { BacklinkTargetScope } from "@/lib/providers/types";
import { cn } from "@/lib/ui/cn";
import { GlobeSimpleIcon as GlobeSimple } from "@phosphor-icons/react/dist/csr/GlobeSimple";
import { LinkIcon as Link } from "@phosphor-icons/react/dist/csr/Link";
import { XIcon as X } from "@phosphor-icons/react/dist/csr/X";
import { useLocale, useTranslations } from "next-intl";
import { useForm } from "react-hook-form";
import { z } from "zod";
import type { BacklinksEstimateView, BacklinksLimit } from "./backlinks-workspace-model";

const formSchema = z.object({ target: z.string().trim().min(1).max(2048) });
type FormValues = z.infer<typeof formSchema>;

const analyzeControlHeightClassName = "h-[34px]";

type AnalyzeCardProps = {
  disabled?: boolean;
  estimate: BacklinksEstimateView;
  includeSubdomains: boolean;
  onIncludeSubdomainsChange: (value: boolean) => void;
  onLimitChange: (value: BacklinksLimit) => void;
  onPaymentOptionChange?: (option: ActionPaymentOption) => void;
  onProviderChange?: (provider: string) => void;
  onScopeChange: (value: BacklinkTargetScope) => void;
  onSubmit: () => void;
  onTargetChange: (value: string) => void;
  resultLimit: BacklinksLimit;
  provider?: string;
  providers?: { label: string; value: string }[];
  scope: BacklinkTargetScope;
  submitting?: boolean;
  target: string;
};

export function AnalyzeCard({
  disabled = false,
  estimate,
  includeSubdomains,
  onIncludeSubdomainsChange,
  onLimitChange,
  onProviderChange,
  onPaymentOptionChange,
  onScopeChange,
  onSubmit,
  onTargetChange,
  resultLimit,
  provider,
  providers = [],
  scope,
  submitting = false,
  target,
}: Readonly<AnalyzeCardProps>) {
  const locale = useLocale();
  const t = useTranslations("projectBacklinks.workspace.analyze");
  const scopeOptions = [
    { label: t("wholeSite"), value: "site" },
    { label: t("exactPage"), value: "page" },
  ] as const;
  const limitOptions = [100, 300, 500, 1000].map((value) => ({
    label: t("topLinks", { count: value }),
    value: String(value),
  }));
  function analyzeLabel(submittingLabel: boolean) {
    const action = submittingLabel ? t("analyzing") : t("analyze");
    const quote = estimate.loading ? undefined : estimate.payment;
    if (quote?.cache.state === "hit") return t("cached", { action });
    return quote
      ? t("priced", { action, cost: formatPaymentAmount(quote.charge, locale) })
      : action;
  }
  const { handleSubmit, register, reset } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    values: { target },
  });
  const targetField = register("target");
  const targetIsSet = Boolean(target.trim() && estimate.valid);
  const analyzeDisabled = disabled || submitting || !targetIsSet;

  function clearTarget() {
    reset({ target: "" });
    onTargetChange("");
  }

  return (
    <Card className="min-w-0 p-4 sm:p-5" size="md">
      <form className="grid gap-3" onSubmit={handleSubmit(onSubmit)}>
        <div className="flex flex-col gap-3 md:flex-row md:items-start">
          <div
            data-input-shell
            className={`flex ${analyzeControlHeightClassName} flex-1 items-center gap-2 rounded-control border border-border-control bg-transparent px-2.5 text-[13px] focus-within:border-accent md:min-w-[240px]`}
          >
            <GlobeSimple
              weight="regular"
              aria-hidden
              className="shrink-0 text-fg-muted"
              size={15}
            />
            {targetIsSet ? (
              <span className={cn(quietChipVariants({ size: "sm" }), "min-w-0 font-medium")}>
                <span className="truncate">{target}</span>
                <button
                  aria-label={t("removeTarget", { target })}
                  className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full p-0 leading-none text-fg-muted outline-none transition-colors hover:bg-bg-elev hover:text-fg focus-visible:bg-bg-elev focus-visible:text-fg"
                  onClick={clearTarget}
                  type="button"
                >
                  <X aria-hidden className="block shrink-0" size={10} weight="regular" />
                </button>
              </span>
            ) : (
              <>
                <label className="sr-only" htmlFor="backlinks-target">
                  {t("targetLabel")}
                </label>
                <input
                  data-input-inner
                  {...targetField}
                  autoCapitalize="none"
                  autoCorrect="off"
                  className={`${compactInputClassName} h-full min-h-0 min-w-0 flex-1 bg-transparent text-fg outline-none`}
                  id="backlinks-target"
                  onChange={(event) => {
                    targetField.onChange(event);
                    onTargetChange(event.currentTarget.value);
                  }}
                  placeholder={t("targetPlaceholder")}
                  spellCheck={false}
                />
              </>
            )}
          </div>
          <SegmentedControl
            ariaLabel={t("scopeAria")}
            className="shrink-0"
            fitContent
            onChange={onScopeChange}
            optionClassName="min-w-[92px]"
            options={scopeOptions}
            size="toolbar"
            value={scope}
          />
          <MenuSelect
            ariaLabel={t("limitAria")}
            onChange={(value) => onLimitChange(Number(value) as BacklinksLimit)}
            options={limitOptions}
            triggerClassName={`${analyzeControlHeightClassName} min-h-0 justify-between lg:w-[132px]`}
            value={String(resultLimit)}
          />
          {providers.length > 1 && onProviderChange ? (
            <MenuSelect
              ariaLabel={t("provider")}
              disabled={submitting}
              onChange={onProviderChange}
              options={providers}
              triggerClassName={`${analyzeControlHeightClassName} min-h-0 justify-between`}
              value={provider ?? providers[0].value}
            />
          ) : null}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="inline-flex items-center gap-2.5">
            <Switch
              checked={includeSubdomains}
              className="border-0 bg-transparent px-0 py-0"
              disabled={scope === "page"}
              label={t("includeSubdomains")}
              labelClassName="font-normal"
              onChange={(event) => onIncludeSubdomainsChange(event.currentTarget.checked)}
            />
            <InfoTooltip text={t("subdomainsHelp")} />
          </span>
          <div className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-4">
            {onPaymentOptionChange ? (
              <ActionPaymentOptionPicker
                options={estimate.paymentOptions ?? []}
                value={estimate.payment?.option.id ?? ""}
                disabled={estimate.loading || submitting}
                onChange={(id) => {
                  const option = estimate.paymentOptions?.find((item) => item.id === id);
                  if (option) onPaymentOptionChange(option);
                }}
              />
            ) : null}
            <Button
              disabled={analyzeDisabled}
              loading={submitting}
              loadingLabel={analyzeLabel(true)}
              startIcon={<Link aria-hidden size={14} weight="regular" />}
              style={{ minWidth: 216 }}
              title={!targetIsSet ? t("needTarget") : undefined}
              type="submit"
            >
              {analyzeLabel(false)}
            </Button>
          </div>
        </div>
      </form>
    </Card>
  );
}
