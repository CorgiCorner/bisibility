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
import Popover from "@mui/material/Popover";
import { MagnifyingGlassIcon as MagnifyingGlass, XIcon as X } from "@phosphor-icons/react";
import { type KeyboardEvent, useState } from "react";
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
  location: LocationFieldValue;
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

export function ResearchSearchCard({
  connectionId,
  connectionOptions,
  disabled = false,
  estimate,
  includeClickstream,
  location,
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
  const [pricingAnchor, setPricingAnchor] = useState<HTMLElement | null>(null);
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
              value={location}
            />
          </div>
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
          {connectionOptions.length > 1 ? (
            <MenuSelect
              ariaLabel="Data provider connection"
              onChange={onConnectionChange}
              options={connectionOptions}
              triggerClassName="justify-between md:w-[160px]"
              value={connectionId}
            />
          ) : null}
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
            <button
              className="text-[12px] text-fg-muted transition-colors hover:text-fg"
              onClick={(event) => setPricingAnchor(event.currentTarget)}
              type="button"
            >
              How is this priced?
            </button>
            <Button
              disabled={disabled || researching}
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
      </form>
      <Popover
        anchorEl={pricingAnchor}
        onClose={() => setPricingAnchor(null)}
        open={Boolean(pricingAnchor)}
        anchorOrigin={{ horizontal: "left", vertical: "bottom" }}
        slotProps={{
          paper: {
            className: "rounded-[12px] border border-border-strong",
            sx: {
              bgcolor: "var(--bg-elev)",
              border: "1px solid var(--border-strong)",
              borderRadius: "12px",
              boxShadow: "none",
              overflow: "hidden",
            },
          },
        }}
      >
        <div className="w-[300px] bg-bg-elev p-4 text-fg">
          <p className="m-0 text-[13px] font-semibold">Estimated DataForSEO cost</p>
          <div className="mt-2 grid gap-1.5 font-mono text-[11.5px] text-fg-muted">
            {pricingRows.map((row) => (
              <div className="flex justify-between" key={row.source}>
                <span>{row.source}</span>
                <span>
                  {row.cost == null ? "rate unavailable" : `~${formatEstimateCents(row.cost)}`}
                </span>
              </div>
            ))}
          </div>
          <p className="mb-0 mt-3 text-[11.5px] leading-5 text-fg-muted">
            Cache hits are free for 12 hours. Actual provider cost may differ slightly.
          </p>
        </div>
      </Popover>
    </Card>
  );
}
