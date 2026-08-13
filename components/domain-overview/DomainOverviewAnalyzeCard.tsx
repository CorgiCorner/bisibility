"use client";

import { LocationField, type LocationFieldValue } from "@/components/keywords/LocationField";
import { Button, Card, Kbd } from "@/components/ui";
import { formatEstimateCents } from "@/lib/cost-estimate/project-estimate";
import type { DomainOverviewReport, DomainOverviewScope } from "@/lib/domain-overview/types";
import { normalizeDomain } from "@/lib/domains/normalize";
import { zodResolver } from "@/lib/forms/zod-resolver";
import { GlobeIcon as Globe, InfoIcon as Info } from "@phosphor-icons/react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { DomainOverviewPricingPopover } from "./DomainOverviewPricingPopover";
import { domainOverviewControlHeight } from "./domain-overview-control-styles";
import {
  type DomainOverviewEstimateView,
  type DomainOverviewMarketSelection,
  detectedDomainScope,
} from "./domain-overview-workspace-model";

const formSchema = z.object({ target: z.string().trim().min(1).max(253) });
type FormValues = z.infer<typeof formSchema>;

type DomainOverviewAnalyzeCardProps = {
  estimate: DomainOverviewEstimateView;
  market: DomainOverviewMarketSelection;
  onMarketChange: (market: LocationFieldValue) => void;
  onScopeChange: (scope: DomainOverviewScope | undefined) => void;
  onSubmit: (target: string, fresh: boolean) => void;
  onTargetChange: (target: string) => void;
  projectId: string;
  scopeOverride?: DomainOverviewScope;
  submitting: boolean;
  target: string;
  report?: DomainOverviewReport | null;
};

function submitLabel(estimate: DomainOverviewEstimateView, fresh: boolean, submitting: boolean) {
  const prefix = fresh
    ? submitting
      ? "Refreshing domain"
      : "Refresh now"
    : submitting
      ? "Analyzing domain"
      : "Analyze domain";
  const cost = fresh ? estimate.freshCostCents : estimate.costCents;
  if (!fresh && estimate.cached) return `${prefix} free, cached`;
  return cost == null ? prefix : `${prefix} ~${formatEstimateCents(cost)}`;
}

export function DomainOverviewAnalyzeCard({
  estimate,
  market,
  onMarketChange,
  onScopeChange,
  onSubmit,
  onTargetChange,
  projectId,
  scopeOverride,
  submitting,
  target,
  report,
}: Readonly<DomainOverviewAnalyzeCardProps>) {
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
  const valid = Boolean(detected && estimate.valid && actionCost != null);
  const descriptionIds = ["domain-overview-scope-help"];
  if (report && !matchesReport) descriptionIds.push("domain-overview-report-target-note");

  return (
    <Card className="overflow-visible p-[18px] sm:p-5" size="md">
      <form
        className="grid gap-3.5"
        onSubmit={handleSubmit(({ target: next }) => {
          if (valid) onSubmit(next, matchesReport);
        })}
      >
        <div className="flex flex-col gap-2.5 md:flex-row md:items-start">
          <div
            className={`${domainOverviewControlHeight()} flex flex-1 items-center gap-2 rounded-[9px] border border-border-strong px-3 focus-within:border-accent md:min-w-[320px]`}
          >
            <Globe aria-hidden className="shrink-0 text-fg-muted" size={15} />
            <input
              {...targetField}
              aria-describedby={descriptionIds.join(" ")}
              aria-label="Domain or subdomain"
              autoCapitalize="none"
              autoCorrect="off"
              className="min-w-0 flex-1 bg-transparent py-2 text-[13px] text-fg outline-none placeholder:text-fg-muted"
              disabled={submitting}
              onChange={(event) => {
                targetField.onChange(event);
                onTargetChange(event.currentTarget.value);
              }}
              placeholder="Enter any domain or subdomain, e.g. blog.deskhaus.com"
              spellCheck={false}
            />
            {valid ? (
              <Kbd>
                <span aria-hidden>↵</span>
                <span className="sr-only">Enter</span>
              </Kbd>
            ) : null}
          </div>
          <div className="md:w-[230px]">
            <LocationField
              controlClassName={domainOverviewControlHeight()}
              disabled={submitting}
              idPrefix="domain-overview"
              label="Market"
              labelHidden
              onChange={onMarketChange}
              projectId={projectId}
              value={market}
              variant="toolbar"
            />
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          {detected ? (
            <span
              className="inline-flex max-w-full items-center gap-2 rounded-full border border-border bg-bg-sunken px-2.5 py-1 text-[12px]"
              id="domain-overview-scope-help"
            >
              <Info aria-hidden className="shrink-0 text-fg-muted" size={13} />
              Detected: {resolvedScope === "subdomain" ? "subdomain" : "whole domain"}
              <span className="truncate font-mono text-[11.5px]">{target}</span>
              {detected === "subdomain" ? (
                <button
                  className="shrink-0 font-semibold text-accent-text hover:underline"
                  onClick={() =>
                    onScopeChange(resolvedScope === "subdomain" ? "root" : "subdomain")
                  }
                  type="button"
                >
                  Change
                </button>
              ) : null}
            </span>
          ) : (
            <span
              className="inline-flex items-center gap-2 text-[12.5px] text-fg-muted"
              id="domain-overview-scope-help"
            >
              <Info aria-hidden size={14} />
              Scope is read from what you type - a subdomain analyzes that subdomain only.
            </span>
          )}
          <div className="ml-auto flex items-center gap-4">
            <button
              className="whitespace-nowrap text-[12.5px] text-fg-muted underline decoration-border-strong underline-offset-4 hover:text-fg"
              onClick={(event) => setPricingAnchor(event.currentTarget)}
              type="button"
            >
              How is this priced?
            </button>
            <Button
              aria-describedby={
                report && !matchesReport ? "domain-overview-report-target-note" : undefined
              }
              className={domainOverviewControlHeight()}
              disabled={!valid || submitting}
              loading={submitting}
              loadingLabel={submitLabel(estimate, matchesReport, true)}
              startIcon={<Globe aria-hidden size={14} weight="bold" />}
              sx={{ minHeight: 40, minWidth: 200 }}
              title={!valid ? "Enter a valid domain and wait for its price" : undefined}
              type="submit"
            >
              {submitLabel(estimate, matchesReport, false)}
            </Button>
          </div>
        </div>
        {report && !matchesReport ? (
          <p className="text-[12px] text-fg-muted" id="domain-overview-report-target-note">
            Results below are still for <span className="font-mono">{report.target}</span>.
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
