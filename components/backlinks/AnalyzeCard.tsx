"use client";

import { Button, Card, InfoTooltip, MenuSelect, SegmentedControl, Switch } from "@/components/ui";
import { formatEstimateCents } from "@/lib/cost-estimate/project-estimate";
import { zodResolver } from "@/lib/forms/zod-resolver";
import type { BacklinkTargetScope } from "@/lib/providers/types";
import {
  GlobeSimpleIcon as GlobeSimple,
  LinkIcon as Link,
  XIcon as X,
} from "@phosphor-icons/react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { AnalyzePricingPopover } from "./AnalyzePricingPopover";
import type { BacklinksEstimateView, BacklinksLimit } from "./backlinks-workspace-model";

const formSchema = z.object({ target: z.string().trim().min(1).max(2048) });
type FormValues = z.infer<typeof formSchema>;

const scopeOptions = [
  { label: "Whole site", value: "site" },
  { label: "Exact page", value: "page" },
] as const;

const limitOptions = [100, 300, 500, 1000].map((value) => ({
  label: `Top ${value} links`,
  value: String(value),
}));

type AnalyzeCardProps = {
  disabled?: boolean;
  estimate: BacklinksEstimateView;
  includeSubdomains: boolean;
  onIncludeSubdomainsChange: (value: boolean) => void;
  onLimitChange: (value: BacklinksLimit) => void;
  onScopeChange: (value: BacklinkTargetScope) => void;
  onSubmit: () => void;
  onTargetChange: (value: string) => void;
  resultLimit: BacklinksLimit;
  scope: BacklinkTargetScope;
  submitting?: boolean;
  target: string;
};

function analyzeLabel(estimate: BacklinksEstimateView, submitting: boolean) {
  const prefix = submitting ? "Analyzing" : "Analyze";
  if (estimate.cached) return `${prefix} free, cached`;
  if (estimate.costCents == null) return prefix;
  return `${prefix} ~${formatEstimateCents(estimate.costCents)}`;
}

export function AnalyzeCard({
  disabled = false,
  estimate,
  includeSubdomains,
  onIncludeSubdomainsChange,
  onLimitChange,
  onScopeChange,
  onSubmit,
  onTargetChange,
  resultLimit,
  scope,
  submitting = false,
  target,
}: Readonly<AnalyzeCardProps>) {
  const [pricingAnchor, setPricingAnchor] = useState<HTMLElement | null>(null);
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
    <Card className="overflow-visible p-4 sm:p-5" size="md">
      <form className="grid gap-3" onSubmit={handleSubmit(onSubmit)}>
        <div className="flex flex-col gap-3 md:flex-row md:items-start">
          <div className="flex h-[38px] flex-1 items-center gap-2 rounded-[9px] border border-border-strong bg-transparent px-2.5 text-[13px] focus-within:border-accent md:min-w-[240px]">
            <GlobeSimple aria-hidden className="shrink-0 text-fg-muted" size={15} />
            {targetIsSet ? (
              <span className="inline-flex min-w-0 items-center gap-1.5 rounded-[6px] bg-bg-sunken px-2 py-1 font-medium">
                <span className="truncate">{target}</span>
                <button
                  aria-label={`Remove ${target}`}
                  className="shrink-0 rounded-full text-fg-muted transition-colors hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-solid"
                  onClick={clearTarget}
                  type="button"
                >
                  <X aria-hidden size={11} weight="bold" />
                </button>
              </span>
            ) : (
              <>
                <label className="sr-only" htmlFor="backlinks-target">
                  Backlinks target
                </label>
                <input
                  {...targetField}
                  autoCapitalize="none"
                  autoCorrect="off"
                  className="min-w-0 flex-1 bg-transparent py-2 text-[13px] text-fg outline-none placeholder:text-fg-muted"
                  id="backlinks-target"
                  onChange={(event) => {
                    targetField.onChange(event);
                    onTargetChange(event.currentTarget.value);
                  }}
                  placeholder="Enter a domain or URL"
                  spellCheck={false}
                />
              </>
            )}
          </div>
          <SegmentedControl
            ariaLabel="Backlinks target scope"
            className="shrink-0 [&>div]:!min-h-[38px]"
            fitContent
            onChange={onScopeChange}
            optionClassName="min-w-[92px] !min-h-[30px]"
            options={scopeOptions}
            size="field"
            value={scope}
          />
          <MenuSelect
            ariaLabel="Backlinks limit"
            onChange={(value) => onLimitChange(Number(value) as BacklinksLimit)}
            options={limitOptions}
            triggerClassName="min-h-[38px] justify-between lg:w-[132px]"
            value={String(resultLimit)}
          />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="inline-flex items-center gap-2.5">
            <Switch
              checked={includeSubdomains}
              className="border-0 bg-transparent px-0 py-0"
              disabled={scope === "page"}
              label="Include subdomains"
              labelClassName="font-normal"
              onChange={(event) => onIncludeSubdomainsChange(event.currentTarget.checked)}
            />
            <InfoTooltip text="Counts links to blog.acme-store.com and other subdomains as part of the profile. Does not change the price." />
          </span>
          <div className="flex flex-wrap items-center gap-4">
            <button
              className="text-[12px] text-fg-muted transition-colors hover:text-fg"
              onClick={(event) => setPricingAnchor(event.currentTarget)}
              type="button"
            >
              How is this priced?
            </button>
            <Button
              disabled={analyzeDisabled}
              loading={submitting}
              loadingLabel={analyzeLabel(estimate, true)}
              startIcon={<Link aria-hidden size={14} weight="bold" />}
              sx={{ minWidth: 216 }}
              title={!targetIsSet ? "Enter a domain first - the price appears here" : undefined}
              type="submit"
            >
              {analyzeLabel(estimate, false)}
            </Button>
          </div>
        </div>
      </form>
      <AnalyzePricingPopover anchor={pricingAnchor} onClose={() => setPricingAnchor(null)} />
    </Card>
  );
}
