import { providerSegmentCssVars } from "@/lib/theme/chart-colors";

export type ProviderSpendInput = {
  label: string;
  spentCents: number;
};

export type SpendSegment = {
  color: string;
  label: string;
  spentCents: number;
};

export const OTHER_SEGMENT_LABEL = "Other";
export const OTHER_SEGMENT_COLOR = "var(--fg-muted)";

function segmentColor(index: number): string {
  if (index < 2) {
    return providerSegmentCssVars[index];
  }
  // Providers 3+ cycle orange then blue.
  return providerSegmentCssVars[2 + ((index - 2) % 2)];
}

/** Orders providers by spend and groups sub-1%-of-cap providers into a faint "Other". */
export function buildSpendSegments(
  providers: readonly ProviderSpendInput[],
  capCents: number,
): SpendSegment[] {
  const sorted = [...providers].sort((a, b) => b.spentCents - a.spentCents);
  const groupingThresholdCents = capCents > 0 ? capCents * 0.01 : 0;
  const main = sorted.filter((provider) => provider.spentCents >= groupingThresholdCents);
  const grouped = sorted.filter((provider) => provider.spentCents < groupingThresholdCents);

  const segments = main.map((provider, index) => ({ ...provider, color: segmentColor(index) }));
  if (grouped.length > 0) {
    segments.push({
      color: OTHER_SEGMENT_COLOR,
      label: OTHER_SEGMENT_LABEL,
      spentCents: grouped.reduce((total, provider) => total + provider.spentCents, 0),
    });
  }
  return segments;
}
