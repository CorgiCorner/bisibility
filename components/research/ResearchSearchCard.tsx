"use client";

import { LocationField, type LocationFieldValue } from "@/components/keywords/LocationField";
import { Button, Card, InfoTooltip, MenuSelect, Switch } from "@/components/ui";
import { formatEstimateCents } from "@/lib/cost-estimate/project-estimate";
import {
  estimatedFeatureCostCents,
  type KeywordResearchSource,
  keywordResearchRate,
} from "@/lib/cost-estimate/provider-rates";
import { zodResolver } from "@/lib/forms/zod-resolver";
import type { KeywordResearchMode } from "@/lib/keyword-research/types";
import { LIST_PROVIDER_RATE_CONTEXT } from "@/lib/provider-rates/resolver";
import { docsLinkProps } from "@/lib/site/site";
import {
  GlobeSimpleIcon as GlobeSimple,
  MagnifyingGlassIcon as MagnifyingGlass,
  XIcon as X,
} from "@phosphor-icons/react";
import type { KeyboardEvent } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

const formSchema = z.object({ seed: z.string().trim().max(80) });
type FormValues = z.infer<typeof formSchema>;

const modeOptions = [
  { label: "Auto", value: "auto" },
  { label: "Related", value: "related" },
  { label: "Suggestions", value: "suggestions" },
  { label: "Ideas", value: "ideas" },
];
const limitOptions = [100, 300, 500].map((value) => ({
  label: `${value} results`,
  value: String(value),
}));
const pricingDocsHref = "/docs/api/keyword-research#research-keywords";

export type ResearchEstimateView = {
  cached: boolean;
  costCents: number | null;
  loading: boolean;
};

type ResearchSearchCardProps = {
  connectionId: string;
  connectionOptions: Array<{ label: string; value: string }>;
  disabled?: boolean;
  estimate: ResearchEstimateView;
  includeClickstream: boolean;
  lookupDisabled?: boolean;
  location: LocationFieldValue;
  metricsScope?: { country: string; language: string };
  mode: KeywordResearchMode;
  onConnectionChange: (value: string) => void;
  onIncludeClickstreamChange: (value: boolean) => void;
  onLimitChange: (value: 100 | 300 | 500) => void;
  onLocationChange: (value: LocationFieldValue) => void;
  onModeChange: (value: KeywordResearchMode) => void;
  onSeedsChange: (seeds: string[]) => void;
  onSubmit: (seeds: string[]) => void;
  projectId: string;
  resultLimit: 100 | 300 | 500;
  researching: boolean;
  seeds: string[];
};

function sourcesFor(mode: KeywordResearchMode): KeywordResearchSource[] {
  if (mode === "auto") return ["related", "suggestions", "ideas"];
  return [mode];
}

// The button always carries a price: the server estimate when one is in, otherwise
// the provider price list computed client-side ("cost visible before every lookup").
function researchButtonLabel(
  researching: boolean,
  estimate: ResearchEstimateView,
  fallbackCostCents: number | null,
) {
  const prefix = researching ? "Researching" : "Research";
  if (estimate.cached) return `${prefix} free, cached`;
  const costCents = estimate.costCents ?? fallbackCostCents;
  if (costCents == null) return prefix;
  return `${prefix} ~${formatEstimateCents(costCents)}`;
}

function researchLanguageLabel(location: LocationFieldValue) {
  return location.languageLabel?.trim() || location.hl?.trim() || "English";
}

function researchMarketLabel(location: LocationFieldValue) {
  return `${location.displayName} / ${researchLanguageLabel(location)}`;
}

export function ResearchSearchCard({
  connectionId,
  connectionOptions,
  disabled = false,
  estimate,
  includeClickstream,
  lookupDisabled = false,
  location,
  metricsScope,
  mode,
  onConnectionChange,
  onIncludeClickstreamChange,
  onLimitChange,
  onLocationChange,
  onModeChange,
  onSeedsChange,
  onSubmit,
  projectId,
  resultLimit,
  researching,
  seeds,
}: Readonly<ResearchSearchCardProps>) {
  const { getValues, handleSubmit, register, resetField } = useForm<FormValues>({
    defaultValues: { seed: "" },
    resolver: zodResolver(formSchema),
  });

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
    onSubmit(next);
    onSeedsChange([]);
    resetField("seed");
  }

  const pricingRows = sourcesFor(mode).map((source) => {
    const rate = keywordResearchRate("dataforseo", source);
    return {
      cost: rate
        ? estimatedFeatureCostCents(
            rate,
            resultLimit,
            includeClickstream,
            LIST_PROVIDER_RATE_CONTEXT,
          )
        : null,
      source,
    };
  });
  const fallbackCostCents = pricingRows.every((row) => row.cost != null)
    ? pricingRows.reduce((sum, row) => sum + (row.cost ?? 0), 0) * Math.max(seeds.length, 1)
    : null;
  const marketLabel = researchMarketLabel(location);

  return (
    <Card className="overflow-visible p-4 sm:p-5" size="md">
      <form className="grid gap-3" onSubmit={handleSubmit(submit)}>
        <div className="flex flex-col gap-3 md:flex-row md:items-start">
          <div className="flex min-h-[34px] flex-1 flex-wrap items-center gap-1.5 rounded-[9px] border border-border-strong bg-transparent px-2.5 py-0.5 focus-within:border-accent md:min-w-[240px]">
            {seeds.map((seed) => (
              <span
                className="inline-flex items-center gap-1 rounded-full border border-border bg-bg-elev px-2.5 py-1 text-[12px] font-medium"
                key={seed}
              >
                {seed}
                <button
                  aria-label={`Remove ${seed}`}
                  className="text-fg-muted hover:text-fg"
                  onClick={() => onSeedsChange(seeds.filter((item) => item !== seed))}
                  type="button"
                >
                  <X size={11} weight="bold" />
                </button>
              </span>
            ))}
            <input
              {...register("seed")}
              aria-label="Seed keyword"
              className="min-w-[160px] flex-1 bg-transparent px-1 py-1 text-[12.5px] font-medium text-fg outline-none placeholder:text-fg-muted"
              disabled={disabled || researching || seeds.length >= 5}
              id="research-seed"
              onKeyDown={handleSeedKeyDown}
              placeholder={seeds.length === 0 ? "Enter up to 5 seed keywords" : "Add another seed"}
            />
          </div>
          <div className="md:w-[230px]">
            <LocationField
              disabled={disabled || researching}
              variant="toolbar"
              help="Defaults to the project market."
              idPrefix="research"
              label="Market"
              labelHidden
              onChange={onLocationChange}
              projectId={projectId}
              value={{ ...location, displayName: marketLabel }}
            />
          </div>
          <MenuSelect
            ariaLabel="Data provider connection"
            leadingIcon={<span>Provider:</span>}
            onChange={onConnectionChange}
            options={connectionOptions}
            triggerClassName="justify-between md:w-[160px]"
            value={connectionId}
          />
          <MenuSelect
            ariaLabel="Results limit"
            onChange={(value) => onLimitChange(Number(value) as 100 | 300 | 500)}
            options={limitOptions}
            triggerClassName="justify-between md:w-[132px]"
            value={String(resultLimit)}
          />
          <MenuSelect
            ariaLabel="Research mode"
            leadingIcon={<span>Mode:</span>}
            onChange={(value) => onModeChange(value as KeywordResearchMode)}
            options={modeOptions}
            triggerClassName="justify-between md:w-auto md:min-w-[132px]"
            value={mode}
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="inline-flex items-center gap-1.5">
            <Switch
              checked={includeClickstream}
              className="border-0 bg-transparent px-0 py-0"
              label="Clickstream volumes"
              labelClassName="font-normal"
              onChange={(event) => onIncludeClickstreamChange(event.target.checked)}
            />
            <InfoTooltip text="Volumes corrected with real-user browsing data instead of Google Ads estimates alone. About twice the lookup cost." />
          </span>
          <div className="flex flex-wrap items-center gap-4">
            <a
              className="text-[12px] text-fg-muted underline decoration-border underline-offset-4 transition-colors hover:text-fg"
              href={pricingDocsHref}
              {...docsLinkProps(pricingDocsHref)}
            >
              How is this priced?
            </a>
            <Button
              disabled={disabled || lookupDisabled || researching}
              loading={researching}
              loadingLabel={researchButtonLabel(true, estimate, fallbackCostCents)}
              startIcon={<MagnifyingGlass size={15} weight="bold" />}
              sx={{ minWidth: 216 }}
              type="submit"
            >
              {researchButtonLabel(false, estimate, fallbackCostCents)}
            </Button>
          </div>
        </div>
        {metricsScope ? (
          <div
            aria-label={`Metrics scope: ${metricsScope.country} - ${metricsScope.language}`}
            className="-mx-4 -mb-4 mt-1 flex items-center gap-2 rounded-b-[12px] border-t border-border bg-bg-sunken px-4 py-2.5 font-mono text-[11.5px] text-fg-muted sm:-mx-5 sm:-mb-5 sm:px-5"
            role="status"
          >
            <GlobeSimple aria-hidden size={14} />
            <span>
              Metrics scope: {metricsScope.country} - {metricsScope.language}
            </span>
          </div>
        ) : null}
      </form>
    </Card>
  );
}
