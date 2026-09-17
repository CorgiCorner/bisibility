"use client";

import { PricingPopover, type PricingRow } from "@/components/ui/PricingPopover";
import { formatEstimateCents } from "@/lib/cost-estimate/project-estimate";
import {
  estimatedFeatureCostCents,
  type KeywordResearchSource,
  keywordResearchRate,
} from "@/lib/cost-estimate/provider-rates";
import type { KeywordResearchMode } from "@/lib/keyword-research/types";
import { LIST_PROVIDER_RATE_CONTEXT } from "@/lib/provider-rates/resolver";
import { docsLinkProps } from "@/lib/site/site";
import { useTranslations } from "next-intl";

export type ResearchPricingRow = { cost: number | null; source: KeywordResearchSource };

const pricingDocsHref = "/docs/api/keyword-research#research-keywords";

export function sourcesFor(mode: KeywordResearchMode): KeywordResearchSource[] {
  if (mode === "auto") return ["related", "suggestions", "ideas"];
  return [mode];
}

export function researchPricingRows(
  mode: KeywordResearchMode,
  resultLimit: number,
  includeClickstream: boolean,
): ResearchPricingRow[] {
  return sourcesFor(mode).map((source) => {
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
}

export function researchFallbackCostCents(
  rows: ResearchPricingRow[],
  seedCount: number,
): number | null {
  if (!rows.every((row) => row.cost != null)) return null;
  return rows.reduce((sum, row) => sum + (row.cost ?? 0), 0) * Math.max(seedCount, 1);
}

type ResearchPricingPopoverProps = {
  anchor: HTMLElement | null;
  includeClickstream: boolean;
  mode: KeywordResearchMode;
  onClose: () => void;
  resultLimit: number;
  seedCount: number;
};

export function ResearchPricingPopover({
  anchor,
  includeClickstream,
  mode,
  onClose,
  resultLimit,
  seedCount,
}: Readonly<ResearchPricingPopoverProps>) {
  const t = useTranslations("projectResearch.pricing");
  const rows = researchPricingRows(mode, resultLimit, includeClickstream);

  const pricingRows: PricingRow[] = rows.map((row) => ({
    label: t(row.source),
    value: row.cost == null ? t("unavailable") : formatEstimateCents(row.cost),
  }));
  pricingRows.push({ label: t("cache"), value: t("free") });

  return (
    <PricingPopover
      anchor={anchor}
      footer={
        <p className="mb-0">
          {t("footer", { seedCount })}
          <br />
          <a
            className="underline decoration-border underline-offset-4 hover:text-fg"
            href={pricingDocsHref}
            {...docsLinkProps(pricingDocsHref)}
          >
            {t("docs")}
          </a>
        </p>
      }
      onClose={onClose}
      rows={pricingRows}
    />
  );
}
