"use client";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { compactInputClassName } from "@/components/ui/input-styles";
import { Kbd } from "@/components/ui/Kbd";
import { pricingTriggerClassName } from "@/components/ui/PricingPopover";
import type { DomainOverviewReport, DomainOverviewScope } from "@/lib/domain-overview/types";
import { normalizeDomain } from "@/lib/domains/normalize";
import { zodResolver } from "@/lib/forms/zod-resolver";
import type { ResearchScope } from "@/lib/research/scope";
import { GlobeIcon as Globe } from "@phosphor-icons/react/dist/csr/Globe";
import { InfoIcon as Info } from "@phosphor-icons/react/dist/csr/Info";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { DomainOverviewPricingPopover } from "./DomainOverviewPricingPopover";
import { domainOverviewControlHeight } from "./domain-overview-control-styles";
import { formatDomainCost } from "./domain-overview-metrics";
import {
  type DomainOverviewEstimateView,
  detectedDomainScope,
} from "./domain-overview-workspace-model";
import { ResearchScopePicker } from "./ResearchScopePicker";

const formSchema = z.object({ target: z.string().trim().min(1).max(253) });
type FormValues = z.infer<typeof formSchema>;

type DomainOverviewAnalyzeCardProps = {
  catalogScopes: readonly ResearchScope[];
  estimate: DomainOverviewEstimateView;
  onResearchScopeChange: (scope: ResearchScope) => void;
  onScopeChange: (scope: DomainOverviewScope | undefined) => void;
  onSubmit: (target: string, fresh: boolean) => void;
  onTargetChange: (target: string) => void;
  scopeOverride?: DomainOverviewScope;
  submitting: boolean;
  target: string;
  researchScope: ResearchScope;
  trackedScopes: readonly ResearchScope[];
  report?: DomainOverviewReport | null;
};

export function DomainOverviewAnalyzeCard({
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
  report,
}: Readonly<DomainOverviewAnalyzeCardProps>) {
  const locale = useLocale();
  const t = useTranslations("projectDomainOverview.workspace.analyze");
  function submitLabel(fresh: boolean, submittingLabel: boolean) {
    const action = fresh
      ? submittingLabel
        ? t("refreshing")
        : t("refresh")
      : submittingLabel
        ? t("analyzing")
        : t("submit");
    const cost = fresh ? estimate.freshCostCents : estimate.costCents;
    if (!fresh && estimate.cached) return t("cached", { action });
    return cost == null ? action : t("priced", { action, cost: formatDomainCost(cost, locale) });
  }
  const [pricingAnchor, setPricingAnchor] = useState<HTMLElement | null>(null);
  const { handleSubmit, register } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    values: { target },
  });
  const targetField = register("target");
  const detected = detectedDomainScope(target);
  const resolvedScope = detected === "root" ? "root" : (scopeOverride ?? detected);
  const matchesReport = Boolean(
    report && normalizeDomain(target) === report.target && resolvedScope === report.scope,
  );
  const actionCost = matchesReport ? estimate.freshCostCents : estimate.costCents;
  const valid = Boolean(
    detected &&
      estimate.valid &&
      actionCost != null &&
      researchScope.researchAvailable &&
      researchScope.providerLocationCode != null,
  );
  const descriptionIds = ["domain-overview-scope-help"];
  if (report && !matchesReport) descriptionIds.push("domain-overview-report-target-note");

  return (
    <Card className="p-4.5 sm:p-5" size="md">
      <form
        className="grid gap-3.5"
        onSubmit={handleSubmit(({ target: next }) => {
          if (valid) onSubmit(next, matchesReport);
        })}
      >
        <div className="flex flex-col gap-2.5 md:flex-row md:items-start">
          <div
            className={`${domainOverviewControlHeight()} flex flex-1 items-center gap-2 rounded-control border border-border-control px-3 focus-within:border-accent md:min-w-[320px]`}
          >
            <Globe weight="regular" aria-hidden className="shrink-0 text-fg-muted" size={15} />
            <input
              {...targetField}
              aria-describedby={descriptionIds.join(" ")}
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
              ariaLabel={t("countryAria", { country: researchScope.countryName })}
              catalogScopes={catalogScopes}
              disabled={submitting}
              onChange={onResearchScopeChange}
              researchScope={researchScope}
              trackedScopes={trackedScopes}
              triggerClassName={`${domainOverviewControlHeight()} w-full bg-bg-elev px-3 text-[13px] disabled:opacity-55`}
              triggerTitle={t("changeCountry")}
              triggerWrapperClassName="w-full"
            />
          </div>
        </div>
        <div className="flex items-center justify-end gap-4">
          <button
            className={pricingTriggerClassName}
            onClick={(event) => setPricingAnchor(event.currentTarget)}
            type="button"
          >
            {t("pricing")}
          </button>
          <Button
            aria-describedby={
              report && !matchesReport ? "domain-overview-report-target-note" : undefined
            }
            disabled={!valid || submitting}
            loading={submitting}
            loadingLabel={submitLabel(matchesReport, true)}
            size="sm"
            startIcon={<Globe aria-hidden size={14} weight="regular" />}
            style={{ height: 37, minHeight: 37, minWidth: 200 }}
            title={!valid ? t("needValid") : undefined}
            type="submit"
          >
            {submitLabel(matchesReport, false)}
          </Button>
        </div>
        <div className="-mx-4.5 -mb-4.5 border-t border-border px-4.5 py-3.5 sm:-mx-5 sm:-mb-5 sm:px-5">
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
        </div>
        {report && !matchesReport ? (
          <p className="text-[12px] text-fg-muted" id="domain-overview-report-target-note">
            {t("previousResult", { target: report.target })}
          </p>
        ) : null}
      </form>
      <DomainOverviewPricingPopover
        anchor={pricingAnchor}
        estimate={estimate}
        onClose={() => setPricingAnchor(null)}
      />
    </Card>
  );
}
