"use client";

import { ActionPaymentOptionPicker } from "@/components/action-payment/ActionPaymentOptionPicker";
import { usePaymentAmountFormatter } from "@/components/action-payment/use-payment-amount-formatter";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { compactInputClassName } from "@/components/ui/input-styles";
import { Kbd } from "@/components/ui/Kbd";
import type { ActionPaymentOption } from "@/lib/action-payment/contract";
import type { DomainOverviewScope } from "@/lib/domain-overview/types";
import { zodResolver } from "@/lib/forms/zod-resolver";
import type { ResearchScope } from "@/lib/research/scope";
import { GlobeIcon as Globe } from "@phosphor-icons/react/dist/csr/Globe";
import { InfoIcon as Info } from "@phosphor-icons/react/dist/csr/Info";
import { useTranslations } from "next-intl";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { domainOverviewControlHeight } from "./domain-overview-control-styles";
import {
  type DomainOverviewEstimateView,
  detectedDomainScope,
} from "./domain-overview-workspace-model";
import { ResearchScopePicker } from "./ResearchScopePicker";

const formSchema = z.object({ target: z.string().trim().min(1).max(253) });
type FormValues = z.infer<typeof formSchema>;

type DomainOverviewAnalyzeCardProps = {
  disabled?: boolean;
  onPaymentOptionChange?: (option: ActionPaymentOption) => void;
  catalogScopes: readonly ResearchScope[];
  estimate: DomainOverviewEstimateView;
  onResearchScopeChange: (scope: ResearchScope) => void;
  onScopeChange: (scope: DomainOverviewScope | undefined) => void;
  onSubmit: (target: string, fresh: boolean) => void;
  onTargetChange: (target: string) => void;
  scopeOverride?: DomainOverviewScope;
  submitting: boolean;
  target: string;
  researchScope: ResearchScope | null;
  trackedScopes: readonly ResearchScope[];
};

export function DomainOverviewAnalyzeCard({
  disabled = false,
  onPaymentOptionChange,
  catalogScopes,
  estimate,
  onResearchScopeChange,
  onScopeChange,
  onSubmit,
  onTargetChange,
  scopeOverride,
  submitting,
  target,
  researchScope,
  trackedScopes,
}: Readonly<DomainOverviewAnalyzeCardProps>) {
  const presentAmount = usePaymentAmountFormatter();
  const t = useTranslations("projectDomainOverview.workspace.analyze");
  const quote = estimate.loading ? undefined : estimate.payment;
  const presented = quote && quote.cache.state !== "hit" ? presentAmount(quote.charge) : undefined;
  function submitLabel(submittingLabel: boolean) {
    const action = submittingLabel ? t("analyzing") : t("submit");
    if (quote?.cache.state === "hit") return t("cached", { action });
    return presented ? t("priced", { action, cost: presented.text }) : action;
  }
  const { handleSubmit, register } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    values: { target },
  });
  const targetField = register("target");
  const detected = detectedDomainScope(target);
  const resolvedScope = detected === "root" ? "root" : (scopeOverride ?? detected);
  const valid = Boolean(
    detected &&
      estimate.valid &&
      researchScope?.researchAvailable &&
      researchScope?.providerLocationCode != null,
  );

  return (
    <Card className="min-w-0 p-4.5 sm:p-5" size="md">
      <form
        className="grid gap-3.5"
        onSubmit={handleSubmit(({ target: next }) => {
          if (valid) onSubmit(next, false);
        })}
      >
        <div className="flex flex-col gap-2.5 md:flex-row md:items-start">
          <div
            data-input-shell
            className={`${domainOverviewControlHeight()} flex flex-1 items-center gap-2 rounded-control border border-border-control px-3 focus-within:border-accent md:min-w-[320px]`}
          >
            <Globe weight="regular" aria-hidden className="shrink-0 text-fg-muted" size={15} />
            <input
              data-input-inner
              {...targetField}
              aria-describedby="domain-overview-scope-help"
              aria-label={t("targetAria")}
              autoCapitalize="none"
              autoCorrect="off"
              className={`${compactInputClassName} h-full min-h-0 min-w-0 flex-1 bg-transparent text-fg outline-none`}
              disabled={submitting}
              onChange={(event) => {
                targetField.onChange(event);
                onTargetChange(event.currentTarget.value);
              }}
              placeholder={t("targetPlaceholder")}
              spellCheck={false}
            />
            {valid ? (
              <Kbd>
                <span aria-hidden>↵</span>
                <span className="sr-only">{t("enter")}</span>
              </Kbd>
            ) : null}
          </div>
          <div className="md:w-[230px]">
            <ResearchScopePicker
              ariaLabel={
                researchScope
                  ? t("countryAria", { country: researchScope.countryName })
                  : t("changeCountry")
              }
              catalogScopes={catalogScopes}
              disabled={
                submitting || (!researchScope && !catalogScopes.length && !trackedScopes.length)
              }
              onChange={onResearchScopeChange}
              researchScope={researchScope}
              trackedScopes={trackedScopes}
              triggerClassName={`${domainOverviewControlHeight()} w-full bg-bg-elev px-3 text-[13px] disabled:opacity-55`}
              triggerTitle={t("changeCountry")}
              triggerWrapperClassName="w-full"
            />
          </div>
        </div>
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
          {detected ? (
            <span
              className="inline-flex max-w-full items-center gap-2 rounded-full border border-border bg-bg-sunken px-2.5 py-1 text-[12px]"
              id="domain-overview-scope-help"
            >
              <Info weight="regular" aria-hidden className="shrink-0 text-fg-muted" size={13} />
              {t("detected", {
                scope: resolvedScope === "subdomain" ? t("subdomain") : t("wholeDomain"),
              })}
              <span className="truncate font-sans tabular-nums text-[11.5px]">{target}</span>
              {detected === "subdomain" ? (
                <button
                  className="shrink-0 font-semibold text-accent-text hover:underline"
                  onClick={() =>
                    onScopeChange(resolvedScope === "subdomain" ? "root" : "subdomain")
                  }
                  type="button"
                >
                  {t("change")}
                </button>
              ) : null}
            </span>
          ) : (
            <span
              className="inline-flex items-center gap-2 text-[12.5px] text-fg-muted"
              id="domain-overview-scope-help"
            >
              <Info weight="regular" aria-hidden size={14} />
              {t("scopeHelp")}
            </span>
          )}
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
              disabled={disabled || !valid || submitting}
              loading={submitting}
              loadingLabel={submitLabel(true)}
              size="sm"
              startIcon={<Globe aria-hidden size={14} weight="regular" />}
              style={{ height: 37, minHeight: 37, minWidth: 200 }}
              title={!valid ? t("needValid") : presented?.title}
              type="submit"
            >
              {submitLabel(false)}
            </Button>
          </div>
        </div>
      </form>
    </Card>
  );
}
