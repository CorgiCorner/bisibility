import {
  estimatedFeatureCostCents,
  keywordResearchRate,
  type KeywordResearchSource as RateSource,
} from "@/lib/cost-estimate/provider-rates";
import type { GroupedResearchRow } from "@/lib/keyword-research/grouping";
import type { KeywordResearchSuccess } from "@/lib/keyword-research/types";
import { difficultyBucket } from "@/lib/keyword-research/view-model";
import { LIST_PROVIDER_RATE_CONTEXT } from "@/lib/provider-rates/resolver";

// Pure presentation helpers shared by the results table and the detail panel.
// Keep this module free of "use client", MUI and DOM APIs so the panel does not
// drag the export-menu dependency chain in - see research-results-view.tsx.

export type MonthlyTrendPoint = GroupedResearchRow["monthlyTrend"][number];

export const MONTH_LABELS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

// Providers report monthly searches newest-first; charts read left-to-right, oldest-first.
export function chronologicalTrend(points: readonly MonthlyTrendPoint[]): MonthlyTrendPoint[] {
  return [...points].sort((left, right) => left.year - right.year || left.month - right.month);
}

export function difficultyColor(value: number | null) {
  const bucket = difficultyBucket(value);
  if (bucket === "easy") return "var(--rank-bucket-green)";
  if (bucket === "medium") return "var(--rank-bucket-yellow)";
  if (bucket === "hard") return "var(--rank-bucket-red)";
  return "var(--fg-muted)";
}

export function difficultyPillStyle(value: number | null) {
  const color = difficultyColor(value);
  return { borderColor: color, color };
}

// --yellow is the border/fill shade; --yellow-text keeps amber text readable.
const INTENT_CHIPS: Record<string, { border: string; color: string; label: string }> = {
  commercial: { border: "var(--yellow)", color: "var(--yellow-text)", label: "Comm" },
  informational: { border: "var(--blue)", color: "var(--blue)", label: "Info" },
  navigational: { border: "var(--purple)", color: "var(--purple)", label: "Nav" },
  transactional: { border: "var(--green)", color: "var(--green-text)", label: "Trans" },
};

export function intentChipMeta(intent: string | null) {
  return intent == null ? null : (INTENT_CHIPS[intent] ?? null);
}

export function IntentChip({ intent }: Readonly<{ intent: string | null }>) {
  const meta = intentChipMeta(intent);
  if (!meta) return <span className="font-mono text-[11px] text-fg-muted">-</span>;
  return (
    <span
      className="rounded-full border px-2 py-0.5 text-[10.5px] font-semibold"
      style={{ borderColor: meta.border, color: meta.color }}
      title={intent ?? undefined}
    >
      {meta.label}
    </span>
  );
}

const RATE_SOURCES: Record<KeywordResearchSuccess["sources"][number]["source"], RateSource> = {
  idea: "ideas",
  related: "related",
  suggestion: "suggestions",
};

// Cost transparency: the deeper-run price must be visible before the paid action.
// Prefer the server estimate; fall back to the provider price list.
export function deeperResearchCostCents(
  result: Pick<KeywordResearchSuccess, "connections" | "sources">,
  nextLimit: number,
  estimate?: { cached: boolean; costCents: number },
): number | null {
  if (estimate) return estimate.cached ? 0 : estimate.costCents;
  const providerId = result.connections[0]?.provider;
  if (!providerId) return null;
  const total = result.sources.reduce(
    (sum, source) =>
      sum +
      (estimatedFeatureCostCents(
        keywordResearchRate(providerId, RATE_SOURCES[source.source]),
        nextLimit,
        false,
        LIST_PROVIDER_RATE_CONTEXT,
      ) ?? 0),
    0,
  );
  return total > 0 ? total : null;
}
